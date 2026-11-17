import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicCourse, PublicCoursesRepository, levelLabels } from './public-courses-repository';

@Component({
  selector: 'app-cursos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './cursos.html',
  styleUrl: './cursos.scss',
})
export class Cursos {
  private readonly repository = inject(PublicCoursesRepository);
  private request = 0;
  readonly levels = levelLabels;
  readonly courses = signal<PublicCourse[]>([]);
  readonly state = signal<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  readonly search = signal('');
  readonly level = signal('');
  readonly filtered = computed(() => {
    const search = this.search().trim().toLocaleLowerCase('es');
    return this.courses().filter((course) =>
      (!this.level() || course.level === this.level()) &&
      (!search || `${course.title} ${course.summary ?? ''}`.toLocaleLowerCase('es').includes(search)));
  });

  constructor() { void this.load(); }

  async load(): Promise<void> {
    const request = ++this.request;
    this.state.set('loading');
    try {
      const courses = await this.repository.list();
      if (request !== this.request) return;
      this.courses.set(courses);
      this.state.set('ready');
    } catch (error) {
      if (request !== this.request) return;
      this.state.set(error instanceof Error && error.message === 'unavailable' ? 'unavailable' : 'error');
    }
  }
}
