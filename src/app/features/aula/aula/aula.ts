import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { AulaData, AulaRepository } from '../aula-repository';
import { EndedUnsubscribe, PlaybackSource, VideoPlaybackService, subscribePlaybackEnded } from '../video-playback';
import { LessonMaterials } from '../lesson-materials/lesson-materials';
import { ClassroomNav } from '../classroom-nav';
import { LessonComments } from '../../comentarios/lesson-comments';
import { SkeletonBlock } from '../../../shared/skeleton/skeleton';
import { LessonFavoritesRepository } from '../../favoritos/repository';

/**
 * Estados de la fuente de vídeo. Se pide automáticamente al cargar una lección
 * de tipo `video`; no hay paso previo de «Ver vídeo». Nunca se reproduce sola:
 * el alumno pulsa Play en el reproductor del proveedor.
 */
type VideoState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'expired';

@Component({
  selector: 'app-aula',
  imports: [RouterLink, LessonMaterials, ClassroomNav, LessonComments, SkeletonBlock],
  templateUrl: './aula.html',
  styleUrl: './aula.scss',
})
export class Aula {
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  private readonly repository = inject(AulaRepository);
  private readonly playback = inject(VideoPlaybackService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('aulaHeading');
  private focusedLessonKey: string | null = null;
  private loadedKey: string | null = null;
  private loadedCourse = '';
  private loadedUser = '';
  private videoTimer: ReturnType<typeof setTimeout> | null = null;
  private videoRequest = 0;
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private request = 0;
  private destroyed = false;
  readonly state = signal<'loading' | 'unconfigured' | 'error' | 'denied' | 'ready'>('loading');
  readonly data = signal<AulaData | null>(null);
  /** Cambio de lección dentro del mismo curso: se conservan índice y contenido previos. */
  readonly switching = signal(false);
  /** Comprimir el índice es solo maquetación de escritorio: sin persistencia, se
   *  reinicia al cambiar de curso o de identidad para no mezclar estados. */
  readonly indexCompact = signal(false);
  readonly videoSource = signal<PlaybackSource | null>(null);
  readonly videoState = signal<VideoState>('idle');
  /** Aviso del proveedor; se conserva al caducar para no perder su explicación. */
  readonly notice = signal<string | null>(null);
  /** Suscripción al `ended` verificado: baja al cambiar de lección, caducar o destruir. */
  private endedUnsub: EndedUnsubscribe | null = null;
  private autoCompleteSignature = '';
  private autoCompleting = false;
  readonly autoCompleted = signal(false);
  readonly autoCompleteError = signal<string | null>(null);
  readonly videoFrameId = 'lesson-video-frame';
  private readonly videoLessonId = computed(() => this.data()?.lesson.content_type === 'video' ? this.data()!.lesson.id : null);
  readonly saving = signal(false);
  readonly saveError = signal(false);
  /** El índice ya no lleva estrella: el único control vive junto al progreso. */
  private readonly favoritesRepo = inject(LessonFavoritesRepository, { optional: true });
  readonly favoriteAvailable = signal(false);
  readonly favoriteOn = signal(false);
  readonly favoriteError = signal<string | null>(null);
  private favoriteRequest = 0;
  private favoriteToggling = false;
  private readonly favoriteLessonId = computed(() => this.data()?.lesson.id ?? '');
  private readonly favoriteIdentity = computed(() =>
    `${this.data()?.course.id ?? ''}\u0000${this.favoriteLessonId()}\u0000${this.auth.session()?.user.id ?? ''}`);
  readonly courseSlug = computed(() => this.params().get('courseSlug') ?? '');
  readonly lessonSlug = computed(() => this.params().get('lessonSlug') ?? '');
  /** Datos del índice: se conservan durante el cambio de lección para no desmontar el nav. */
  readonly navCourse = computed(() => {
    const data = this.data();
    return data ? {
      id: data.course.id, title: data.course.title, teacher: data.course.teacher ?? '',
      sections: data.sections, lessons: data.lessons,
    } : null;
  });
  /** Selección derivada de la URL sobre las lecciones conocidas, sin estado local duplicado. */
  readonly activeId = computed(() => {
    const slug = this.lessonSlug();
    return this.data()?.lessons.find(lesson => lesson.slug === slug)?.id ?? '';
  });
  /** Estado de progreso del índice: solo existe si hay derecho que permita seguirlo. */
  readonly completedIds = computed<ReadonlySet<string> | null>(() => {
    const data = this.data();
    if (!data?.canTrack) return null;
    const ids = new Set(data.completedLessonIds ?? []);
    if (data.completed) ids.add(data.lesson.id); else ids.delete(data.lesson.id);
    return ids;
  });
  readonly orderedLessons = computed(() => {
    const data = this.data();
    return data ? data.sections.flatMap(s => data.lessons.filter(l => l.section_id === s.id)) : [];
  });
  readonly previous = computed(() => {
    const list = this.orderedLessons();
    return list[list.findIndex(l => l.id === this.data()?.lesson.id) - 1] ?? null;
  });
  readonly next = computed(() => {
    const list = this.orderedLessons();
    const index = list.findIndex(l => l.id === this.data()?.lesson.id);
    return index < 0 ? null : list[index + 1] ?? null;
  });
  readonly returnUrl = computed(() => `/aula/${encodeURIComponent(this.courseSlug())}/${encodeURIComponent(this.lessonSlug())}`);
  private readonly retryCount = signal(0);

  /**
   * Clave efectiva de carga. Un TOKEN_REFRESHED entrega un objeto Session nuevo
   * con el mismo `user.id`: no debe recargar ni reevaluar permisos ni repetir la
   * petición de vídeo. El estado `loading` (auth aún inicializándose) no produce
   * clave, para no cachear un id nulo previo al inicio de sesión.
   */
  private readonly loadKey = computed(() => {
    const status = this.auth.status();
    if (status === 'loading' || status === 'unconfigured') return '';
    const session = this.auth.session();
    // El error solo altera la clave cuando no hay sesión (estado de error).
    const errorPart = !session && this.auth.error() ? '\u0000error' : '';
    return `${this.courseSlug()}\u0000${this.lessonSlug()}\u0000${session?.user.id ?? 'anon'}\u0000${status}${errorPart}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
      this.videoRequest++;
      this.clearVideoTimer();
      this.endedUnsub?.();
      this.endedUnsub = null;
    });
    effect(() => {
      const status = this.auth.status();
      const key = this.loadKey();
      this.retryCount();

      if (status === 'loading') {
        this.resetVideo();
        this.loadedKey = null;
        this.data.set(null);
        this.switching.set(false);
        this.indexCompact.set(false);
        this.state.set('loading');
        return;
      }
      if (status === 'unconfigured') {
        this.resetVideo();
        this.loadedKey = null;
        this.data.set(null);
        this.switching.set(false);
        this.indexCompact.set(false);
        this.state.set('unconfigured');
        return;
      }

      // Misma lección y usuario (un TOKEN_REFRESHED): conservar datos, vídeo y
      // foco; no recargar ni repetir peticiones.
      if (key === this.loadedKey) return;

      const session = this.auth.session();
      const course = this.courseSlug();
      const lesson = this.lessonSlug();
      const user = session?.user.id ?? 'anon';
      // Cambiar de lección dentro del mismo curso conserva el árbol del índice
      // y el contenido anterior; solo se limpia en logout, error, denegación o
      // cambio de curso. El contador `request` descarta respuestas obsoletas.
      const sameCourse = !!this.data() && this.loadedCourse === course && this.loadedUser === user;
      const request = ++this.request;
      this.loadedKey = key;
      this.loadedCourse = course;
      this.loadedUser = user;
      this.resetVideo();
      this.saving.set(false);
      this.saveError.set(false);

      if (this.auth.error() && !session) {
        this.data.set(null);
        this.switching.set(false);
        this.state.set('error');
        return;
      }
      if (sameCourse) {
        this.switching.set(true);
      } else {
        this.data.set(null);
        this.switching.set(false);
        this.indexCompact.set(false);
        this.state.set('loading');
      }

      void this.repository.load(course, lesson, session?.user.id ?? null).then(data => {
        if (this.destroyed || request !== this.request) return;
        this.data.set(data);
        this.switching.set(false);
        if (data) {
          this.state.set('ready');
          this.focusLesson(course, lesson);
          // El vídeo se monta solo: contenido de la lección actual ya autorizada.
          if (data.lesson.content_type === 'video') this.loadVideo();
        } else {
          this.state.set('denied');
        }
      }).catch(() => {
        if (!this.destroyed && request === this.request) {
          this.switching.set(false);
          this.state.set('error');
          this.data.set(null);
        }
      });
    });

    // La estrella pertenece a la lección abierta y a la identidad: se recarga al
    // entrar o cambiar de lección, no al refrescar un token del mismo usuario.
    effect(() => {
      const status = this.auth.status();
      this.favoriteIdentity(); // dependencia: curso, lección e identidad
      const lessonId = this.favoriteLessonId();
      if (!this.favoritesRepo || status !== 'authenticated' || !lessonId) {
        this.favoriteRequest++;
        this.favoriteAvailable.set(false);
        this.favoriteOn.set(false);
        this.favoriteError.set(null);
        return;
      }
      untracked(() => this.loadFavorite(lessonId));
    });
  }

  private loadFavorite(lessonId: string): void {
    const repo = this.favoritesRepo!;
    const request = ++this.favoriteRequest;
    this.favoriteToggling = false;
    this.favoriteOn.set(false);
    this.favoriteError.set(null);
    this.favoriteAvailable.set(false);
    void repo.list().then(rows => {
      if (this.destroyed || request !== this.favoriteRequest) return;
      this.favoriteOn.set(rows.some(row => row.lessonId === lessonId));
      this.favoriteAvailable.set(true);
    }, () => {
      // Sin configuración o sin derecho: no se pinta la estrella (honesto).
      if (this.destroyed || request !== this.favoriteRequest) return;
      this.favoriteAvailable.set(false);
      this.favoriteOn.set(false);
    });
  }

  /** Alterna el favorito de la lección actual sin tocar el progreso manual. */
  toggleFavorite(): void {
    const repo = this.favoritesRepo;
    const lessonId = this.favoriteLessonId();
    if (!repo || !this.favoriteAvailable() || !lessonId || this.favoriteToggling) return;
    const request = this.favoriteRequest;
    this.favoriteToggling = true;
    this.favoriteError.set(null);
    void repo.toggle(lessonId).then(favorite => {
      if (this.destroyed || request !== this.favoriteRequest) return;
      this.favoriteOn.set(favorite);
    }, () => {
      if (this.destroyed || request !== this.favoriteRequest) return;
      this.favoriteError.set('No se ha podido actualizar favoritos. Inténtalo de nuevo.');
    }).finally(() => {
      if (request === this.favoriteRequest) this.favoriteToggling = false;
    });
  }

  favoriteLabel(): string {
    return this.favoriteOn() ? 'Quitar lección de favoritos' : 'Añadir lección a favoritos';
  }

  /** Botón único en el contenido: alterna el ancho del índice sin ocultarlo. */
  toggleIndexCompact(): void {
    this.indexCompact.update(value => !value);
  }

  // Enfoca el encabezado solo al cambiar de lección (no al refrescar sesión ni
  // en reintentos de la misma). Nunca enfoca el iframe del vídeo.
  private focusLesson(course: string, lesson: string): void {
    const key = `${course}/${lesson}`;
    if (key === this.focusedLessonKey) return;
    this.focusedLessonKey = key;
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Retira el reproductor y descarta firma, suscripción y avisos en curso. */
  private resetVideo(): void {
    this.videoRequest++;
    this.clearVideoTimer();
    this.endedUnsub?.();
    this.endedUnsub = null;
    this.autoCompleteSignature = '';
    this.autoCompleting = false;
    this.autoCompleted.set(false);
    this.autoCompleteError.set(null);
    this.videoSource.set(null);
    this.notice.set(null);
    this.videoState.set('idle');
  }

  private clearEnded(): void {
    this.endedUnsub?.();
    this.endedUnsub = null;
    this.autoCompleteSignature = '';
    this.autoCompleted.set(false);
  }

  private clearVideoTimer(): void {
    if (this.videoTimer !== null) {
      clearTimeout(this.videoTimer);
      this.videoTimer = null;
    }
  }

  /**
   * Pide la fuente de la lección actual. Se invoca al cargar una lección de vídeo
   * y al reintentar/renovar tras un fallo. Un contador descarta respuestas
   * obsoletas al cambiar de lección, usuario o al destruir el componente.
   */
  loadVideo(): void {
    const lessonId = this.videoLessonId();
    if (!lessonId) return;
    const request = ++this.videoRequest;
    this.clearVideoTimer();
    this.clearEnded();
    this.autoCompleteError.set(null);
    this.videoSource.set(null);
    this.videoState.set('loading');

    let pending: PlaybackSource | null | Promise<PlaybackSource | null>;
    try {
      pending = this.playback.sourceForLesson(lessonId);
    } catch {
      if (!this.destroyed && request === this.videoRequest) this.videoState.set('error');
      return;
    }
    Promise.resolve(pending).then(source => {
      if (this.destroyed || request !== this.videoRequest) return;
      this.videoSource.set(source);
      if (!source) {
        this.videoState.set('unavailable');
        return;
      }
      this.notice.set(source.notice);
      this.videoState.set('ready');
      // Solo el proveedor verificado ofrece `ended`; sin él queda el botón manual.
      this.endedUnsub = subscribePlaybackEnded(source, this.videoFrameId, () => this.onVideoEnded(lessonId, request));
      this.scheduleExpiry(source, request);
    }).catch(() => {
      if (!this.destroyed && request === this.videoRequest) this.videoState.set('error');
    });
  }

  /** `expiresAt` llega en milisegundos Unix desde el adaptador. */
  private scheduleExpiry(source: PlaybackSource, request: number): void {
    if (typeof source.expiresAt !== 'number' || !Number.isFinite(source.expiresAt)) return;
    const delay = source.expiresAt - Date.now();
    if (delay <= 0) {
      this.expire(request);
      return;
    }
    this.videoTimer = setTimeout(() => this.expire(request), delay);
  }

  private expire(request: number): void {
    if (this.destroyed || request !== this.videoRequest) return;
    this.clearVideoTimer();
    this.clearEnded();
    this.videoSource.set(null);
    this.videoState.set('expired');
  }

  /**
   * `ended` verificado del proveedor: guarda una sola vez, y solo con derecho
   * activo, usuario vigente, misma generación y lección aún no completada.
   * No demuestra atención real; complementa, no sustituye, el botón manual.
   */
  private onVideoEnded(lessonId: string, request: number): void {
    if (this.destroyed || request !== this.videoRequest) return;
    const data = this.data();
    if (!data || data.lesson.id !== lessonId || !data.canTrack || data.completed) return;
    const userId = this.auth.session()?.user.id;
    if (!userId) return;
    const signature = `${lessonId}\u0000${request}`;
    if (this.autoCompleting || this.autoCompleteSignature === signature) return;
    this.autoCompleteSignature = signature;
    this.autoCompleting = true;
    void this.repository.save(userId, lessonId, true).then(() => {
      if (this.destroyed || request !== this.videoRequest || this.data()?.lesson.id !== lessonId) return;
      const current = this.data()!;
      const ids = new Set(current.completedLessonIds ?? []);
      ids.add(lessonId);
      this.data.set({ ...current, completed: true, completedLessonIds: [...ids] });
      this.autoCompleted.set(true);
    }).catch(() => {
      if (this.destroyed || request !== this.videoRequest) return;
      this.autoCompleteSignature = '';
      this.autoCompleteError.set('No se pudo marcar la lección como completada. Inténtalo de nuevo.');
    }).finally(() => {
      if (request === this.videoRequest) this.autoCompleting = false;
    });
  }

  // El reintento manual fuerza una recarga aunque la clave efectiva no cambie.
  retry(): void {
    this.loadedKey = null;
    this.retryCount.update(n => n + 1);
  }

  /** Etiqueta corta para la duración opcional de la lección (mm:ss). */
  durationLabel(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${rest}`;
  }

  async toggleProgress(): Promise<void> {
    const data = this.data();
    const userId = this.auth.session()?.user.id;
    if (!data?.canTrack || !userId || this.saving()) return;
    const request = this.request;
    const completed = !data.completed;
    this.saving.set(true);
    this.saveError.set(false);
    try {
      await this.repository.save(userId, data.lesson.id, completed);
      if (!this.destroyed && request === this.request) {
        const completedIds = new Set(data.completedLessonIds ?? []);
        if (completed) completedIds.add(data.lesson.id); else completedIds.delete(data.lesson.id);
        this.data.set({ ...data, completed, completedLessonIds: [...completedIds] });
      }
    } catch {
      if (!this.destroyed && request === this.request) this.saveError.set(true);
    } finally {
      if (!this.destroyed && request === this.request) this.saving.set(false);
    }
  }
}
