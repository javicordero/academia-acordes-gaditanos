import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  PublicCourse,
  PublicCoursesRepository,
  levelLabels,
} from '../cursos/public-courses-repository';
import { SkeletonBlock } from '../../shared/skeleton/skeleton';

interface PreviewLesson {
  readonly courseSlug: string;
  readonly lessonSlug: string;
  readonly title: string;
}

/**
 * Portada provisional. Reutiliza el repositorio público de cursos: solo muestra
 * cursos publicados y una lección de muestra marcada como gratuita en el
 * catálogo. No hay compra, pago ni promesas de resultado en esta página.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SkeletonBlock],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly repository = inject(PublicCoursesRepository);
  private request = 0;

  readonly levels = levelLabels;
  readonly courses = signal<PublicCourse[]>([]);
  readonly state = signal<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  readonly previewLesson = signal<PreviewLesson | null>(null);

  /** Como máximo tres cursos destacados, en el orden del repositorio público. */
  readonly featured = computed(() => this.courses().slice(0, 3));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const request = ++this.request;
    this.state.set('loading');
    this.previewLesson.set(null);
    try {
      const courses = await this.repository.list();
      if (request !== this.request) return;
      this.courses.set(courses);
      this.state.set('ready');
      void this.findPreview(courses.slice(0, 3), request);
    } catch (error) {
      if (request !== this.request) return;
      this.state.set(
        error instanceof Error && error.message === 'unavailable'
          ? 'unavailable'
          : 'error',
      );
    }
  }

  /**
   * Busca una lección de muestra real entre los cursos destacados. Un fallo al
   * consultar el detalle de un curso no rompe la portada: simplemente no se
   * ofrece enlace de muestra.
   */
  private async findPreview(courses: PublicCourse[], request: number): Promise<void> {
    const results = await Promise.allSettled(
      courses.map((course) => this.repository.detail(course.slug)),
    );
    if (request !== this.request) return;
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const lesson = result.value.lessons.find((item) => item.is_free_preview);
      if (!lesson) continue;
      this.previewLesson.set({
        courseSlug: result.value.course.slug,
        lessonSlug: lesson.slug,
        title: lesson.title,
      });
      return;
    }
  }
}
