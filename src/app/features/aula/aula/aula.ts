import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { AulaData, AulaRepository } from '../aula-repository';
import { VIDEO_DEMO_ENABLED, VideoPlaybackService } from '../video-playback';

@Component({
  selector: 'app-aula',
  imports: [RouterLink],
  templateUrl: './aula.html',
  styleUrl: './aula.scss',
})
export class Aula {
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  private readonly repository = inject(AulaRepository);
  private readonly playback = inject(VideoPlaybackService);
  readonly videoDemoEnabled = inject(VIDEO_DEMO_ENABLED);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('aulaHeading');
  private readonly videoFrame = viewChild<ElementRef<HTMLIFrameElement>>('videoFrame');
  private focusedLessonKey: string | null = null;
  private loadedKey: string | null = null;
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private request = 0;
  private destroyed = false;
  readonly state = signal<'loading' | 'unconfigured' | 'error' | 'denied' | 'ready'>('loading');
  readonly data = signal<AulaData | null>(null);
  readonly videoSource = signal<import('../video-playback').PlaybackSource | null>(null);
  readonly videoRequested = signal(false);
  private readonly videoLessonId = computed(() => this.data()?.lesson.id ?? null);
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
   * con el mismo `user.id`: no debe recargar ni reevaluar permisos. El estado
   * `loading` (auth aún inicializándose) no produce clave, para no cachear un id
   * nulo previo al inicio de sesión que luego no se actualice.
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
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; this.request++; });
    effect((onCleanup) => {
      const id = this.videoLessonId();
      let active = true;
      onCleanup(() => { active = false; });
      this.videoSource.set(null);
      if (!id) return;
      Promise.resolve(this.playback.sourceForLesson(id)).then(source => {
        if (active) this.videoSource.set(source);
      }).catch(() => {
        if (active) this.videoSource.set(null);
      });
    });
    effect(() => {
      const status = this.auth.status();
      const key = this.loadKey();
      this.retryCount();

      // Auth aún no inicializada: nunca cachear un id nulo que después no se
      // actualizaría cuando llegue la sesión real.
      if (status === 'loading') {
        this.videoRequested.set(false);
        this.loadedKey = null;
        this.data.set(null);
        this.state.set('loading');
        return;
      }
      if (status === 'unconfigured') {
        this.videoRequested.set(false);
        this.loadedKey = null;
        this.data.set(null);
        this.state.set('unconfigured');
        return;
      }

      // Misma lección y mismo usuario (p. ej. TOKEN_REFRESHED con un Session
      // nuevo): conservar datos, progreso y foco; no recargar ni reevaluar RLS.
      if (key === this.loadedKey) return;

      const session = this.auth.session();
      const course = this.courseSlug();
      const lesson = this.lessonSlug();
      const request = ++this.request;
      this.loadedKey = key;
      // Ruta o usuario distinto: retirar de inmediato el contenido autorizado
      // al usuario anterior antes de volver a preguntar a RLS.
      this.data.set(null);
      this.videoRequested.set(false);
      this.saving.set(false);
      this.saveError.set(false);
      if (this.auth.error() && !session) { this.state.set('error'); return; }
      this.state.set('loading');
      void this.repository.load(course, lesson, session?.user.id ?? null).then(data => {
        if (this.destroyed || request !== this.request) return;
        this.data.set(data);
        this.state.set(data ? 'ready' : 'denied');
        if (data) this.focusLesson(course, lesson);
      }).catch(() => {
        if (!this.destroyed && request === this.request) this.state.set('error');
      });
    });
  }

  // Enfoca el encabezado tras cargar una lección: al navegar (siguiente/anterior)
  // el enlace que tenía el foco se destruye. Solo cambia la clave de lección, de
  // modo que un refresco de sesión o un reintento en la misma lección no roban
  // el foco al botón de progreso ni a otra interacción en curso.
  private focusLesson(course: string, lesson: string): void {
    const key = `${course}/${lesson}`;
    if (key === this.focusedLessonKey) return;
    this.focusedLessonKey = key;
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  // El botón se sustituye por el iframe al cargar el vídeo: mover el foco al
  // reproductor para que no se pierda en el DOM. Solo lo invoca el clic del
  // usuario; ni un refresco de sesión ni el guardado de progreso lo llaman,
  // de modo que no roban el foco. El aviso de terceros se mantiene visible.
  loadVideo(): void {
    if (this.videoRequested()) return;
    this.videoRequested.set(true);
    afterNextRender(() => this.videoFrame()?.nativeElement.focus(), { injector: this.injector });
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
