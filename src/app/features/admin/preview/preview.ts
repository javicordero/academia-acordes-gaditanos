import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonMaterials } from '../../aula/lesson-materials/lesson-materials';
import { PlaybackSource, VideoPlaybackService } from '../../aula/video-playback';
import { LessonComments } from '../../comentarios/lesson-comments';
import { PreviewRepository } from './preview-repository';
import { ClassroomNav } from '../../aula/classroom-nav';

/**
 * Estados de la fuente de vídeo. `Aula` define su equivalente dentro del
 * componente; la vista previa mantiene aquí el suyo para no refactorizar el
 * aula. La fuente y la caducidad se comparten vía
 * `PlaybackSource`/`VideoPlaybackService`.
 */
type VideoState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error' | 'expired';

@Component({
  selector: 'app-admin-preview',
  imports: [RouterLink, LessonMaterials, ClassroomNav, LessonComments],
  templateUrl: './preview.html',
  styleUrls: ['../../aula/aula/aula.scss', './preview.scss'],
})
export class Preview {
  private readonly route = inject(ActivatedRoute);
  private readonly repository = inject(PreviewRepository);
  private readonly auth = inject(AuthService);
  private readonly playback = inject(VideoPlaybackService);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private generation = 0;
  private loadTarget = '';
  private videoTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly data = signal<Awaited<ReturnType<PreviewRepository['load']>>>(null);
  readonly state = signal<'loading' | 'ready' | 'denied' | 'error'>('loading');
  readonly videoSource = signal<PlaybackSource | null>(null);
  readonly videoState = signal<VideoState>('idle');
  /** Aviso del proveedor; se conserva al caducar para no perder su explicación. */
  readonly notice = signal<string | null>(null);
  /**
   * Anuncio único del cambio de lección. Se deja vacío en la carga inicial, en
   * reintentos y en renovaciones de sesión para no duplicar avisos ni robar foco.
   */
  readonly announcement = signal('');
  private focusPending = false;
  readonly courseId = computed(() => this.params().get('courseId') ?? '');
  readonly lessonId = computed(() => this.params().get('lessonId'));
  private readonly userId = computed(() => this.auth.session()?.user.id ?? null);
  /** El h1 nombra la lección abierta; así el foco al cambiar también la anuncia. */
  readonly headingLabel = computed(() => {
    const title = this.data()?.lesson?.title;
    return title ? `Vista previa: ${title}` : 'Vista previa del aula';
  });
  readonly index = computed(() => this.data()?.lessons.findIndex(l => l.id === this.data()?.lesson?.id) ?? -1);
  readonly previous = computed(() => this.data()?.lessons[this.index() - 1]);
  readonly next = computed(() => this.index() < 0 ? undefined : this.data()?.lessons[this.index() + 1]);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.clearVideoTimer();
    });
    effect(() => {
      const authStatus = this.auth.status();
      const course = this.courseId(), lesson = this.lessonId();
      const user = this.userId();
      const admin = this.auth.isAdmin();
      // Toda transición de autenticación invalida respuestas y timers en curso.
      const generation = ++this.generation;
      this.data.set(null);
      this.resetVideo();
      // Cambiar de lección conserva la intención de foco del clic; una
      // renovación de sesión sobre la misma lección no anuncia ni enfoca.
      const target = `${course}/${lesson ?? ''}`;
      if (target === this.loadTarget) {
        this.announcement.set('');
        this.focusPending = false;
      }
      this.loadTarget = target;
      // Igual que el aula: con la sesión aún inicializando no se consulta nada
      // ni se retira el foco; al terminar se evalúa el acceso una sola vez.
      if (authStatus === 'loading') { this.state.set('loading'); return; }
      if (authStatus === 'unconfigured') { this.state.set('denied'); return; }
      // Un TOKEN_REFRESHED con el mismo user.id no cambia `userId()`: no
      // recargamos ni repetimos la petición de vídeo.
      if (!user || !admin) { this.state.set('denied'); return; }
      this.fetch(course, lesson, generation);
    });
  }

  /** Intencionalidad explícita: solo Anterior/Siguiente piden mover el foco. */
  prepareLessonChange(): void { this.focusPending = true; }

  /** Reintento real de la carga fallida, con la misma generación de seguridad. */
  retry(): void {
    if (this.state() !== 'error') return;
    const status = this.auth.status();
    if (status === 'loading') return;
    if (status === 'unconfigured' || !this.userId() || !this.auth.isAdmin()) { this.state.set('denied'); return; }
    const generation = ++this.generation;
    this.data.set(null);
    this.resetVideo();
    this.announcement.set('');
    this.focusPending = false;
    this.fetch(this.courseId(), this.lessonId(), generation);
  }

  private fetch(course: string, lesson: string | null, generation: number): void {
    this.state.set('loading');
    void this.repository.load(course, lesson).then(data => {
      if (generation !== this.generation) return;
      this.data.set(data);
      const ok = !!(data && (!lesson || data.lesson));
      this.state.set(ok ? 'ready' : 'denied');
      if (!ok) { this.focusPending = false; this.announcement.set(''); return; }
      if (this.focusPending) {
        this.focusPending = false;
        this.announcement.set(`Lección actual: ${data?.lesson?.title ?? data?.course.title ?? ''}`);
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
      }
      // El vídeo se monta solo: contenido de la lección actual ya autorizada.
      if (data?.lesson?.content_type === 'video') this.loadVideo();
    }).catch(() => {
      if (generation !== this.generation) return;
      this.focusPending = false;
      this.announcement.set('');
      this.state.set('error');
    });
  }

  /** Retira el reproductor y descarta cualquier firma en curso. */
  private resetVideo(): void {
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
   * Pide la fuente de la lección actual. Se invoca automáticamente al cargar la
   * lección y también en reintentos/renovación. La generación compartida con la
   * carga descarta respuestas de una lección o usuario anteriores.
   */
  loadVideo(): void {
    const lesson = this.data()?.lesson;
    if (!lesson || lesson.content_type !== 'video' || this.videoState() === 'loading') return;
    const generation = this.generation;
    this.clearVideoTimer();
    this.videoSource.set(null);
    this.notice.set(null);
    this.videoState.set('loading');

    let pending: PlaybackSource | null | Promise<PlaybackSource | null>;
    try {
      pending = this.playback.sourceForLesson(lesson.id);
    } catch {
      if (generation === this.generation) this.videoState.set('error');
      return;
    }
    Promise.resolve(pending).then(source => {
      if (generation !== this.generation) return;
      this.videoSource.set(source);
      if (!source) {
        this.videoState.set('unavailable');
        return;
      }
      this.notice.set(source.notice);
      this.videoState.set('ready');
      this.scheduleExpiry(source, generation);
    }).catch(() => {
      if (generation === this.generation) this.videoState.set('error');
    });
  }

  /** `expiresAt` llega en milisegundos Unix desde el adaptador Bunny. */
  private scheduleExpiry(source: PlaybackSource, generation: number): void {
    if (typeof source.expiresAt !== 'number' || !Number.isFinite(source.expiresAt)) return;
    const delay = source.expiresAt - Date.now();
    if (delay <= 0) {
      this.expire(generation);
      return;
    }
    this.videoTimer = setTimeout(() => this.expire(generation), delay);
  }

  private expire(generation: number): void {
    if (generation !== this.generation) return;
    this.clearVideoTimer();
    this.videoSource.set(null);
    this.videoState.set('expired');
  }
}
