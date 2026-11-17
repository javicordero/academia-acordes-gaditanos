import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonMaterials } from '../../aula/lesson-materials/lesson-materials';
import { PlaybackSource, VIDEO_DEMO_ENABLED, VideoPlaybackService } from '../../aula/video-playback';
import { PreviewRepository } from './preview-repository';

@Component({
  selector: 'app-admin-preview',
  imports: [RouterLink, LessonMaterials],
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
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private generation = 0;
  readonly demoEnabled = inject(VIDEO_DEMO_ENABLED);
  readonly data = signal<Awaited<ReturnType<PreviewRepository['load']>>>(null);
  readonly state = signal<'loading' | 'ready' | 'denied' | 'error'>('loading');
  readonly video = signal<PlaybackSource | null>(null);
  readonly videoRequested = signal(false);
  readonly courseId = computed(() => this.params().get('courseId') ?? '');
  readonly lessonId = computed(() => this.params().get('lessonId'));
  readonly index = computed(() => this.data()?.lessons.findIndex(l => l.id === this.data()?.lesson?.id) ?? -1);
  readonly previous = computed(() => this.data()?.lessons[this.index() - 1]);
  readonly next = computed(() => this.index() < 0 ? undefined : this.data()?.lessons[this.index() + 1]);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.generation++);
    effect(() => {
      const course = this.courseId(), lesson = this.lessonId();
      const user = this.auth.session()?.user.id;
      const admin = this.auth.isAdmin();
      const generation = ++this.generation;
      this.data.set(null); this.video.set(null); this.videoRequested.set(false);
      if (!user || !admin) { this.state.set('denied'); return; }
      this.state.set('loading');
      void this.repository.load(course, lesson).then(data => {
        if (generation !== this.generation) return;
        this.data.set(data); this.state.set(data && (!lesson || data.lesson) ? 'ready' : 'denied');
        if (data?.lesson) {
          afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
          void Promise.resolve(this.playback.sourceForLesson(data.lesson.id)).then(video => {
            if (generation === this.generation) this.video.set(video);
          }).catch(() => {});
        }
      }).catch(() => { if (generation === this.generation) this.state.set('error'); });
    });
  }

  loadVideo(): void {
    this.videoRequested.set(true);
    afterNextRender(() => this.frame()?.nativeElement.focus(), { injector: this.injector });
  }
}
