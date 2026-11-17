import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Course } from '../courses-repository';
import { Lesson, Section, StructureRepository } from '../structure-repository';
import { LessonMaterials } from '../lesson-materials/lesson-materials';
import { isLessonContentType } from '../../../shared/lesson-content-type';

function lessonSlug(title: string, lessons: Lesson[]): string {
  const base = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'leccion';
  const used = new Set(lessons.map(lesson => lesson.slug));
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  return slug;
}

@Component({
  selector: 'app-structure',
  imports: [FormsModule, LessonMaterials, RouterLink],
  templateUrl: './structure.html',
  styleUrl: './structure.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Structure implements AfterViewInit {
  readonly course = input.required<Course>();
  readonly closed = output<void>();
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly sectionInput = viewChild<ElementRef<HTMLInputElement>>('sectionInput');
  private readonly lessonInput = viewChild<ElementRef<HTMLInputElement>>('lessonInput');
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly repository = inject(StructureRepository);
  private loadVersion = 0;
  readonly sections = signal<Section[]>([]);
  readonly lessons = signal<Lesson[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadFailed = signal(false);
  readonly error = signal('');
  readonly invalid = signal({ sectionTitle: false, lessonTitle: false, contentType: false });
  readonly sectionEditor = signal<Section | 'new' | null>(null);
  readonly lessonEditor = signal<{ section: Section; lesson?: Lesson } | null>(null);
  readonly materials = signal<Lesson | null>(null);
  private readonly materialsPanel = viewChild(LessonMaterials);
  canOpenMaterials(lesson: Lesson): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lesson.id) &&
      this.lessons().includes(lesson);
  }
  openMaterials(lesson: Lesson): void {
    if (this.saving() || !this.canOpenMaterials(lesson)) return;
    this.materials.set(lesson);
    afterNextRender(() => {
      if (!this.destroyRef.destroyed && this.materials()?.id === lesson.id) this.materialsPanel()?.focusHeading();
    }, { injector: this.injector });
  }
  closeMaterials(): void { this.materials.set(null); this.focus('heading'); }
  sectionTitle = '';
  sectionSummary = '';
  lessonTitle = '';
  contentType = 'video';
  preview = false;
  published = false;

  ngAfterViewInit(): void { this.heading().nativeElement.focus(); void this.load(); }
  async load(): Promise<void> {
    const version = ++this.loadVersion;
    const courseId = this.course().id;
    this.loading.set(true); this.error.set(''); this.loadFailed.set(false);
    try {
      const data = await this.repository.list(courseId);
      if (!this.currentLoad(version, courseId)) return;
      this.sections.set(data.sections); this.lessons.set(data.lessons);
    } catch {
      if (this.currentLoad(version, courseId)) {
        this.loadFailed.set(true); this.error.set('No se ha podido cargar la estructura. Comprueba la conexión y tus permisos.');
      }
    } finally { if (this.currentLoad(version, courseId)) this.loading.set(false); }
  }
  private currentLoad(version: number, courseId: string): boolean {
    return !this.destroyRef.destroyed && version === this.loadVersion && this.course().id === courseId;
  }
  private focus(target: 'heading' | 'section' | 'lesson'): void {
    if (this.destroyRef.destroyed) return;
    afterNextRender(() => {
      if (this.destroyRef.destroyed) return;
      (target === 'heading' ? this.heading() : target === 'section' ? this.sectionInput() : this.lessonInput())?.nativeElement.focus();
    }, { injector: this.injector });
  }
  private clearValidation(): void {
    this.invalid.set({ sectionTitle: false, lessonTitle: false, contentType: false });
  }
  clearField(field: 'sectionTitle' | 'lessonTitle' | 'contentType'): void {
    this.invalid.update(v => ({ ...v, [field]: false }));
  }
  cancelEditor(): void {
    if (this.saving()) return;
    this.sectionEditor.set(null); this.lessonEditor.set(null); this.error.set(''); this.clearValidation();
    this.focus('heading');
  }
  editSection(section?: Section): void {
    if (this.saving()) return;
    this.lessonEditor.set(null);
    this.sectionTitle = section?.title ?? ''; this.sectionSummary = section?.summary ?? '';
    this.clearValidation(); this.error.set(''); this.sectionEditor.set(section ?? 'new'); this.focus('section');
  }
  editLesson(section: Section, lesson?: Lesson): void {
    if (this.saving()) return;
    this.sectionEditor.set(null);
    this.lessonTitle = lesson?.title ?? '';
    this.contentType = lesson ? lesson.content_type : 'video';
    this.preview = lesson?.is_free_preview ?? false; this.published = lesson?.is_published ?? false;
    this.clearValidation(); this.error.set(''); this.lessonEditor.set({ section, lesson }); this.focus('lesson');
  }
  async saveSection(): Promise<void> {
    if (this.saving()) return;
    const editor = this.sectionEditor();
    const title = this.sectionTitle.trim();
    if (!editor) return;
    this.invalid.update(v => ({ ...v, sectionTitle: !title || [...title].length > 120 }));
    if (this.invalid().sectionTitle) return;
    this.saving.set(true); this.error.set('');
    try {
      await this.repository.saveSection(this.course().id, { title, summary: this.sectionSummary.trim() || null },
        Math.max(-1, ...this.sections().map(s => s.position)) + 1, editor === 'new' ? undefined : editor);
      if (this.destroyRef.destroyed) return;
      this.sectionEditor.set(null); await this.load(); this.focus('heading');
    } catch { if (!this.destroyRef.destroyed) this.error.set('No se ha podido guardar el bloque. Comprueba la conexión y tus permisos.'); }
    finally { if (!this.destroyRef.destroyed) this.saving.set(false); }
  }
  async saveLesson(): Promise<void> {
    if (this.saving()) return;
    const editor = this.lessonEditor(); const title = this.lessonTitle.trim();
    if (!editor) return;
    this.invalid.update(v => ({ ...v, lessonTitle: !title || [...title].length > 160,
      contentType: !isLessonContentType(this.contentType) }));
    if (this.invalid().lessonTitle || !isLessonContentType(this.contentType)) return;
    this.saving.set(true); this.error.set('');
    try {
      await this.repository.saveLesson(this.course().id, editor.section.id, {
        title, content_type: this.contentType, is_free_preview: this.preview, is_published: this.published,
      }, Math.max(-1, ...this.lessons().filter(l => l.section_id === editor.section.id).map(l => l.position)) + 1,
      editor.lesson, editor.lesson ? undefined : lessonSlug(title, this.lessons()));
      if (this.destroyRef.destroyed) return;
      this.lessonEditor.set(null); await this.load(); this.focus('heading');
    } catch (error) {
      if (!this.destroyRef.destroyed) this.error.set(error instanceof Error && error.message === 'save_conflict'
        ? 'No se ha podido guardar por un conflicto. Recarga la estructura y vuelve a intentarlo.'
        : 'No se ha podido guardar la lección. Comprueba la conexión y tus permisos.');
    }
    finally { if (!this.destroyRef.destroyed) this.saving.set(false); }
  }
}
