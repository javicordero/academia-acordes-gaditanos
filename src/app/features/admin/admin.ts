import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Course, CoursesRepository } from './courses-repository';
import { CourseEditor } from './course-editor/course-editor';
import { Structure } from './structure/structure';

@Component({
  selector: 'app-admin',
  imports: [CourseEditor, Structure],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin.html',
})
export class Admin {
  private readonly repository = inject(CoursesRepository);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('coursesHeading');
  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly editor = signal<Course | 'new' | null>(null);
  readonly structure = signal<Course | null>(null);
  private loadVersion = 0;

  constructor() { void this.load(); }

  async load(): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set(false);
    try {
      const courses = await this.repository.list();
      if (version === this.loadVersion) this.courses.set(courses);
    } catch {
      if (version === this.loadVersion) this.error.set(true);
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }

  closeEditor(): void {
    this.editor.set(null);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  saved(): void { this.closeEditor(); void this.load(); }

  closeStructure(): void {
    this.structure.set(null);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}
