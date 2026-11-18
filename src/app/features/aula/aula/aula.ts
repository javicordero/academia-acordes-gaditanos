import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { AulaData, AulaRepository } from '../aula-repository';
import { PlaybackSource, VideoPlaybackService } from '../video-playback';
import { LessonMaterials } from '../lesson-materials/lesson-materials';
import { ClassroomNav } from '../classroom-nav';

/**
 * Estados de la fuente de vídeo. Se pide automáticamente al cargar una lección
 * de tipo `video`; no hay paso previo de «Ver vídeo». Nunca se reproduce sola:
 * el alumno pulsa Play en el reproductor del proveedor.
 */
type VideoState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'expired';

@Component({
  selector: 'app-aula',
  imports: [RouterLink, LessonMaterials, ClassroomNav],
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
  private videoTimer: ReturnType<typeof setTimeout> | null = null;
  private videoRequest = 0;
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private request = 0;
  private destroyed = false;
  readonly state = signal<'loading' | 'unconfigured' | 'error' | 'denied' | 'ready'>('loading');
  readonly data = signal<AulaData | null>(null);
  readonly videoSource = signal<PlaybackSource | null>(null);
  readonly videoState = signal<VideoState>('idle');
  /** Aviso del proveedor; se conserva al caducar para no perder su explicación. */
  readonly notice = signal<string | null>(null);
  private readonly videoLessonId = computed(() => this.data()?.lesson.content_type === 'video' ? this.data()!.lesson.id : null);
  readonly saving = signal(false);
  readonly saveError = signal(false);
  readonly courseSlug = computed(() => this.params().get('courseSlug') ?? '');
  readonly lessonSlug = computed(() => this.params().get('lessonSlug') ?? '');
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
    });
    effect(() => {
      const status = this.auth.status();
      const key = this.loadKey();
      this.retryCount();

      if (status === 'loading') {
        this.resetVideo();
        this.loadedKey = null;
        this.data.set(null);
        this.state.set('loading');
        return;
      }
      if (status === 'unconfigured') {
        this.resetVideo();
        this.loadedKey = null;
        this.data.set(null);
        this.state.set('unconfigured');
        return;
      }

      // Misma lección y usuario (un TOKEN_REFRESHED): conservar datos, vídeo y
      // foco; no recargar ni repetir peticiones.
      if (key === this.loadedKey) return;

      const session = this.auth.session();
      const course = this.courseSlug();
      const lesson = this.lessonSlug();
      const request = ++this.request;
      this.loadedKey = key;
      this.data.set(null);
      this.resetVideo();
      this.saving.set(false);
      this.saveError.set(false);
      if (this.auth.error() && !session) { this.state.set('error'); return; }
      this.state.set('loading');
      void this.repository.load(course, lesson, session?.user.id ?? null).then(data => {
        if (this.destroyed || request !== this.request) return;
        this.data.set(data);
        this.state.set(data ? 'ready' : 'denied');
        if (data) this.focusLesson(course, lesson);
        // El vídeo se monta solo: contenido de la lección actual ya autorizada.
        if (data?.lesson.content_type === 'video') this.loadVideo();
      }).catch(() => {
        if (!this.destroyed && request === this.request) this.state.set('error');
      });
    });
  }

  // Enfoca el encabezado solo al cambiar de lección (no al refrescar sesión ni
  // en reintentos de la misma). Nunca enfoca el iframe del vídeo.
  private focusLesson(course: string, lesson: string): void {
    const key = `${course}/${lesson}`;
    if (key === this.focusedLessonKey) return;
    this.focusedLessonKey = key;
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Retira el reproductor y descarta cualquier firma en curso. */
  private resetVideo(): void {
    this.videoRequest++;
    this.clearVideoTimer();
    this.videoSource.set(null);
    this.notice.set(null);
    this.videoState.set('idle');
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
    this.videoSource.set(null);
    this.videoState.set('expired');
  }

  // El reintento manual fuerza una recarga aunque la clave efectiva no cambie.
  retry(): void {
    this.loadedKey = null;
    this.retryCount.update(n => n + 1);
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
      if (!this.destroyed && request === this.request) this.data.set({ ...data, completed });
    } catch {
      if (!this.destroyed && request === this.request) this.saveError.set(true);
    } finally {
      if (!this.destroyed && request === this.request) this.saving.set(false);
    }
  }
}
