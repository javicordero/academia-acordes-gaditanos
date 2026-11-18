import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormField, form, submit, validate } from '@angular/forms/signals';
import { Course, CourseLevel, CourseStatus, CoursesRepository } from '../courses-repository';

@Component({
  selector: 'app-course-editor',
  imports: [FormField],
  templateUrl: './course-editor.html',
  styleUrl: './course-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseEditor implements OnInit, AfterViewInit {
  readonly course = input<Course | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly repository = inject(CoursesRepository);
  readonly saving = signal(false);
  readonly error = signal(false);
  readonly submitAttempted = signal(false);
  readonly model = signal({
    title: '', slug: '', summary: '', description: '',
    level: 'iniciacion', status: 'draft', sort_order: '0',
  });
  readonly fields = form(this.model, (p) => {
    validate(p.title, ({ value }) => {
      const title = value().trim();
      return title.length < 1 || [...title].length > 120
        ? { kind: 'title', message: 'El título debe tener entre 1 y 120 caracteres.' } : undefined;
    });
    validate(p.slug, ({ value }) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value())
      ? undefined : { kind: 'slug', message: 'Usa letras minúsculas sin tildes, números y guiones intermedios.' });
    validate(p.sort_order, ({ value }) => {
      const n = Number(value());
      return /^-?\d+$/.test(value()) && Number.isInteger(n) && n >= -2147483648 && n <= 2147483647
        ? undefined : { kind: 'order', message: 'Introduce un número entero válido.' };
    });
    validate(p.level, ({ value }) => ['iniciacion', 'basico', 'intermedio'].includes(value())
      ? undefined : { kind: 'level', message: 'Selecciona un nivel válido.' });
    validate(p.status, ({ value }) => ['draft', 'published', 'archived'].includes(value())
      ? undefined : { kind: 'status', message: 'Selecciona un estado válido.' });
  });

  /** Campos rechazados por el formulario, para mostrarlos como resumen accesible. */
  readonly invalidFields = computed(() => {
    const fields = this.fields;
    const checks: Array<[boolean, string, string]> = [
      [fields.title().invalid(), 'course-title', 'Título'],
      [fields.slug().invalid(), 'course-slug', 'Identificador (slug)'],
      [fields.level().invalid(), 'course-level', 'Nivel'],
      [fields.status().invalid(), 'course-status', 'Estado'],
      [fields.sort_order().invalid(), 'course-order', 'Orden'],
    ];
    return checks
      .filter(([invalid]) => invalid)
      .map(([, id, label]) => ({ id, label }));
  });

  ngOnInit(): void {
    const course = this.course();
    if (course) this.model.set({
      title: course.title, slug: course.slug, summary: course.summary ?? '',
      description: course.description ?? '', level: course.level, status: course.status,
      sort_order: String(course.sort_order),
    });
  }

  ngAfterViewInit(): void { this.heading().nativeElement.focus(); }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.submitAttempted.set(true);
    await submit(this.fields, async () => {
      if (this.saving()) return;
      this.saving.set(true);
      this.error.set(false);
      const model = this.model();
      const existing = this.course();
      try {
        await this.repository.save({
          ...model, title: model.title.trim(), summary: model.summary.trim() || null,
          description: model.description.trim() || null, level: model.level as CourseLevel,
          status: model.status as CourseStatus, sort_order: Number(model.sort_order),
          published_at: existing?.published_at ?? null,
        }, existing ?? undefined);
        this.saved.emit();
      } catch {
        this.error.set(true);
      } finally {
        this.saving.set(false);
      }
    });
  }
}
