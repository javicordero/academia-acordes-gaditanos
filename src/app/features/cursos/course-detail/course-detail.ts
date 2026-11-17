import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CourseDetail as Detail, PublicCoursesRepository, levelLabels } from '../public-courses-repository';

@Component({
  selector: 'app-course-detail',
  imports: [RouterLink],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseDetail {
  private readonly repository = inject(PublicCoursesRepository);
  private readonly route = inject(ActivatedRoute);
  readonly detail = signal<Detail | null>(null);
  readonly state = signal<'loading' | 'ready' | 'missing' | 'unavailable' | 'error'>('loading');
  readonly levels = levelLabels;
  private request = 0;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => { void this.load(params.get('slug') ?? ''); });
  }

  async load(slug = this.route.snapshot.paramMap.get('slug') ?? ''): Promise<void> {
    const request = ++this.request;
    this.state.set('loading');
    try {
      const detail = await this.repository.detail(slug);
      if (request !== this.request) return;
      this.detail.set(detail);
      this.state.set(detail ? 'ready' : 'missing');
    } catch (error) {
      if (request !== this.request) return;
      this.state.set(error instanceof Error && error.message === 'unavailable' ? 'unavailable' : 'error');
    }
  }
}
