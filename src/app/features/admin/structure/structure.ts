import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnChanges, OnDestroy, SimpleChanges, afterNextRender, computed, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Course } from '../courses-repository';
import { Lesson, Section, StructureRepository } from '../structure-repository';
import { LessonMaterials } from '../lesson-materials/lesson-materials';
import { LessonVideo } from '../lesson-video/lesson-video';
import { isLessonContentType } from '../../../shared/lesson-content-type';
import { SkeletonBlock } from '../../../shared/skeleton/skeleton';

const NO_LESSONS: Lesson[] = [];

type LessonTab = 'datos' | 'video' | 'materiales';
const LESSON_TABS: readonly LessonTab[] = ['datos', 'video', 'materiales'];

type DragItem =
  | { kind: 'section'; id: string }
  | { kind: 'lesson'; id: string; sectionId: string };

type DropTarget =
  | { kind: 'section'; id: string }
  | { kind: 'lesson'; id: string; sectionId: string };

type Selection =
  | { kind: 'section'; id: string }
  | { kind: 'lesson'; id: string; sectionId: string };

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
  imports: [FormsModule, LessonMaterials, LessonVideo, SkeletonBlock, RouterLink],
  templateUrl: './structure.html',
  styleUrl: './structure.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Structure implements AfterViewInit, OnChanges, OnDestroy {
  readonly course = input.required<Course>();
  readonly closed = output<void>();
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly sectionInput = viewChild<ElementRef<HTMLInputElement>>('sectionInput');
  private readonly lessonInput = viewChild<ElementRef<HTMLInputElement>>('lessonInput');
  private readonly outline = viewChild<ElementRef<HTMLElement>>('outline');
  private readonly outlineRows = viewChildren<ElementRef<HTMLButtonElement>>('outlineRow');
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly repository = inject(StructureRepository);
  private loadVersion = 0;
  private reorderPending = false;
  private dropDepth = 0;
  private readonly reorderButtons = viewChildren<ElementRef<HTMLButtonElement>>('reorderButton');

  readonly sections = signal<Section[]>([]);
  readonly lessons = signal<Lesson[]>([]);
  readonly orderedSections = computed(() => [...this.sections()].sort((a, b) => a.position - b.position));
  readonly lessonsBySection = computed(() => {
    const grouped = new Map<string, Lesson[]>();
    for (const lesson of this.lessons()) {
      const list = grouped.get(lesson.section_id);
      if (list) list.push(lesson); else grouped.set(lesson.section_id, [lesson]);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.position - b.position);
    return grouped;
  });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadFailed = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly dragging = signal<DragItem | null>(null);
  readonly dropTarget = signal<DropTarget | null>(null);

  /** Plegado por bloque. Se conserva al recargar y al reordenar. */
  readonly expanded = signal<ReadonlySet<string>>(new Set<string>());
  private knownSectionIds = new Set<string>();
  /** Elemento reflejado en el outline con aria-current; el inspector se edita aparte. */
  readonly selected = signal<Selection | null>(null);

  readonly invalid = signal({ sectionTitle: false, lessonTitle: false, contentType: false });
  readonly sectionEditor = signal<Section | 'new' | null>(null);
  readonly lessonEditor = signal<{ section: Section; lesson?: Lesson } | null>(null);

  /** Las secciones pesadas se montan solo al abrirlas y se conservan ocultas
   *  mientras la lección siga seleccionada: así no se repite una consulta de
   *  estado de vídeo ni una lista de materiales en cada cambio de pestaña. */
  readonly activeTab = signal<LessonTab>('datos');
  readonly videoLoaded = signal(false);
  readonly materialsLoaded = signal(false);
  private readonly materialsPanel = viewChild(LessonMaterials);
  private readonly inspectorTabs = viewChildren<ElementRef<HTMLButtonElement>>('inspectorTab');

  canOpenMaterials(lesson: Lesson): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lesson.id) &&
      this.lessons().includes(lesson);
  }

  /** Cambia de sección dentro del inspector: nunca navega a otra pantalla. */
  selectTab(tab: LessonTab): void {
    this.activeTab.set(tab);
    if (tab === 'video') this.videoLoaded.set(true);
    if (tab === 'materiales') this.materialsLoaded.set(true);
    if (this.destroyRef.destroyed) return;
    afterNextRender(() => {
      if (this.destroyRef.destroyed) return;
      const button = this.inspectorTabs()
        .find(item => item.nativeElement.dataset['tab'] === tab)?.nativeElement;
      this.focusVisible(button, true);
    }, { injector: this.injector });
  }

  /** Roving tabindex: flechas y Inicio/Fin recorren las pestañas, como en ARIA. */
  onTabKeydown(event: KeyboardEvent): void {
    const current = this.activeTab();
    const index = LESSON_TABS.indexOf(current);
    let next: LessonTab | undefined;
    switch (event.key) {
      case 'ArrowRight': next = LESSON_TABS[(index + 1) % LESSON_TABS.length]; break;
      case 'ArrowLeft': next = LESSON_TABS[(index - 1 + LESSON_TABS.length) % LESSON_TABS.length]; break;
      case 'Home': next = LESSON_TABS[0]; break;
      case 'End': next = LESSON_TABS[LESSON_TABS.length - 1]; break;
      default: return;
    }
    event.preventDefault();
    this.selectTab(next);
  }

  openMaterials(lesson: Lesson): void {
    if (this.saving() || !this.canOpenMaterials(lesson)) return;
    this.selectTab('materiales');
    afterNextRender(() => {
      if (!this.destroyRef.destroyed && this.activeTab() === 'materiales') this.materialsPanel()?.focusHeading();
    }, { injector: this.injector });
  }
  closeMaterials(): void { this.selectTab('datos'); this.focus('heading'); }
  sectionTitle = '';
  sectionSummary = '';
  lessonTitle = '';
  contentType = 'video';
  preview = false;
  published = false;

  ngAfterViewInit(): void { this.heading().nativeElement.focus(); void this.load(); }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['course'] && !changes['course'].firstChange) {
      this.loadVersion++;
      this.cancelDrag();
      this.expanded.set(new Set<string>());
      this.knownSectionIds = new Set<string>();
      this.selected.set(null);
    }
  }
  ngOnDestroy(): void { this.cancelDrag(); }

  async load(): Promise<void> {
    const version = ++this.loadVersion;
    const courseId = this.course().id;
    this.loading.set(true); this.error.set(''); this.notice.set(''); this.loadFailed.set(false);
    try {
      const data = await this.repository.list(courseId);
      if (!this.currentLoad(version, courseId)) return;
      this.sections.set(data.sections); this.lessons.set(data.lessons);
      this.syncExpanded(data.sections);
      if (this.selected()?.kind === 'lesson' && !data.lessons.some(l => l.id === this.selected()!.id)) {
        this.selected.set(null);
      }
      if (this.selected()?.kind === 'section' && !data.sections.some(s => s.id === this.selected()!.id)) {
        this.selected.set(null);
      }
    } catch {
      if (this.currentLoad(version, courseId)) {
        this.loadFailed.set(true); this.error.set('No se ha podido cargar la estructura. Comprueba la conexión y tus permisos.');
      }
    } finally { if (this.currentLoad(version, courseId)) this.loading.set(false); }
  }
  private currentLoad(version: number, courseId: string): boolean {
    return !this.destroyRef.destroyed && version === this.loadVersion && this.course().id === courseId;
  }
  private syncExpanded(sections: Section[]): void {
    const ids = new Set(sections.map(section => section.id));
    const next = new Set([...this.expanded()].filter(id => ids.has(id)));
    // Solo se abren los bloques nuevos; los que el usuario plegó siguen plegados.
    for (const section of sections) {
      if (!this.knownSectionIds.has(section.id) && !next.has(section.id)) next.add(section.id);
    }
    this.knownSectionIds = ids;
    this.expanded.set(next);
  }
  isExpanded(id: string): boolean { return this.expanded().has(id); }
  expandSection(id: string): void {
    if (this.expanded().has(id)) return;
    this.expanded.update(current => new Set([...current, id]));
  }
  collapseSection(id: string): void {
    if (!this.expanded().has(id)) return;
    this.expanded.update(current => new Set([...current].filter(item => item !== id)));
  }
  toggleSection(section: Section, event?: Event): void {
    event?.stopPropagation();
    if (this.isExpanded(section.id)) this.collapseSection(section.id); else this.expandSection(section.id);
  }
  outlineKey(kind: 'section' | 'lesson', id: string): string { return `${kind}:${id}`; }
  isSelected(kind: 'section' | 'lesson', id: string): boolean {
    const selection = this.selected();
    return !!selection && selection.kind === kind && selection.id === id;
  }
  typeIcon(type: string): string {
    return type === 'pdf' ? '▤' : type === 'text' ? '≡' : '▶';
  }
  typeLabel(type: string): string {
    return type === 'pdf' ? 'PDF' : type === 'text' ? 'texto' : 'vídeo';
  }
  lessonsFor(sectionId: string): Lesson[] {
    return this.lessonsBySection().get(sectionId) ?? NO_LESSONS;
  }
  reorderButtonKey(kind: 'section' | 'lesson', id: string, direction: 'up' | 'down'): string {
    return `${kind}:${direction}:${id}`;
  }
  /**
   * Enfoca sin desplazar de entrada. Solo si el nodo queda fuera del viewport
   * (inspector debajo del outline en móvil) lo acerca lo mínimo con 'nearest'.
   */
  private focusVisible(element: HTMLElement | undefined, preventScroll: boolean): void {
    if (!element?.isConnected) return;
    element.focus(preventScroll ? { preventScroll: true } : undefined);
    if (!element.isConnected || typeof element.scrollIntoView !== 'function') return;
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight;
    const width = window.innerWidth || document.documentElement.clientWidth;
    if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) {
      element.scrollIntoView({ block: 'nearest' });
    }
  }
  /** `viewChildren` devuelve ElementRef; find() extrae el HTMLButtonElement. */
  private restoreFocus(key: string, fallbackKey: string, preferFallback: boolean): void {
    if (this.destroyRef.destroyed) return;
    const focus = (): void => {
      if (this.destroyRef.destroyed) return;
      const buttons = this.reorderButtons();
      const find = (wanted: string): HTMLButtonElement | undefined =>
        buttons.find(button => button.nativeElement.dataset['reorderKey'] === wanted)?.nativeElement;
      const first = preferFallback ? fallbackKey : key;
      const second = preferFallback ? key : fallbackKey;
      this.focusVisible(find(first) ?? find(second), true);
    };
    afterNextRender(focus, { injector: this.injector });
  }
  private focusOutline(key: string): void {
    if (this.destroyRef.destroyed || !key) return;
    afterNextRender(() => {
      if (this.destroyRef.destroyed) return;
      this.focusVisible(this.outlineRows()
        .find(row => row.nativeElement.dataset['outlineKey'] === key)?.nativeElement, true);
    }, { injector: this.injector });
  }
  /** Flechas recorren el outline; Enter/Espacio los gestiona el botón nativamente. */
  onOutlineKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = this.outlineRows();
    const active = event.target as HTMLElement | null;
    const index = rows.findIndex(row => row.nativeElement === active);
    if (index < 0) return;
    if (event.key === 'Escape') { event.preventDefault(); this.cancelEditor(); return; }
    const element = rows[index].nativeElement;
    const kind = element.dataset['outlineKind'];
    const id = element.dataset['outlineId'] ?? '';
    const sectionId = element.dataset['parentSection'] ?? '';
    let target: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowDown': target = rows[index + 1]?.nativeElement; break;
      case 'ArrowUp': target = rows[index - 1]?.nativeElement; break;
      case 'ArrowRight':
        if (kind === 'section') {
          if (!this.isExpanded(id)) this.expandSection(id);
          else target = rows.find(row => row.nativeElement.dataset['parentSection'] === id)?.nativeElement;
        }
        break;
      case 'ArrowLeft':
        if (kind === 'lesson') {
          target = rows.find(row => row.nativeElement.dataset['outlineKey'] === `section:${sectionId}`)?.nativeElement;
        } else if (this.isExpanded(id)) {
          this.collapseSection(id);
        }
        break;
      default: return;
    }
    event.preventDefault();
    this.focusVisible(target, true);
  }
  private reorderIsCurrent(version: number, courseId: string): boolean {
    return !this.destroyRef.destroyed && version === this.loadVersion && this.course().id === courseId;
  }
  private cancelDrag(): void {
    this.dropDepth = 0;
    this.dragging.set(null);
    this.dropTarget.set(null);
  }
  /** Compara el destino resaltado con la fila; el arrastre nunca resalta su propio origen. */
  sameTarget(a: DropTarget | null, b: DragItem | null): boolean {
    return !!a && !!b && a.kind === b.kind && a.id === b.id;
  }
  private swap<T>(items: T[], index: number, target: number): T[] {
    const ordered = [...items];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    return ordered;
  }
  private positionsOf(ids: string[]): Map<string, number> {
    return new Map(ids.map((id, position) => [id, position]));
  }
  private async runReorder(
    courseId: string,
    version: number,
    focusKey: string,
    fallbackFocusKey: string,
    preferFallback: boolean,
    apply: () => Promise<void>,
    rollback: () => void,
    successNotice: () => string,
  ): Promise<void> {
    if (this.reorderPending) return;
    this.reorderPending = true;
    this.saving.set(true); this.error.set(''); this.notice.set('');
    try {
      await apply();
      if (!this.reorderIsCurrent(version, courseId)) { rollback(); return; }
      await this.load();
      if (!this.reorderIsCurrent(version + 1, courseId)) return;
      if (!this.loadFailed()) this.notice.set(successNotice());
    } catch {
      if (this.reorderIsCurrent(version, courseId)) {
        rollback();
        this.error.set('No se ha podido reordenar. No se ha cambiado nada; vuelve a intentarlo.');
        if (focusKey) this.restoreFocus(focusKey, fallbackFocusKey, false);
      }
    } finally {
      this.reorderPending = false;
      if (!this.destroyRef.destroyed) {
        this.saving.set(false);
        if (focusKey && !this.error()) this.restoreFocus(focusKey, fallbackFocusKey, preferFallback);
      }
    }
  }
  async moveSection(section: Section, direction: -1 | 1): Promise<void> {
    if (this.saving()) return;
    const courseId = this.course().id;
    const version = this.loadVersion;
    const ordered = this.orderedSections();
    const index = ordered.findIndex(item => item.id === section.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const previous = this.sections();
    const desired = this.swap(ordered.map(item => item.id), index, target);
    const positions = this.positionsOf(desired);
    const focusKey = this.reorderButtonKey('section', section.id, direction === -1 ? 'up' : 'down');
    const fallbackFocusKey = this.reorderButtonKey('section', section.id, direction === -1 ? 'down' : 'up');
    await this.runReorder(courseId, version, focusKey, fallbackFocusKey,
      target === 0 || target === ordered.length - 1,
      async () => {
        this.sections.set(ordered.map(item => ({ ...item, position: positions.get(item.id) ?? item.position })));
        await this.repository.reorderCourseSections(courseId, desired);
      },
      () => this.sections.set(previous),
      () => `Bloque «${section.title}» movido a la posición ${(positions.get(section.id) ?? 0) + 1} de ${desired.length}.`);
  }
  async moveLesson(section: Section, lesson: Lesson, direction: -1 | 1): Promise<void> {
    if (this.saving()) return;
    const courseId = this.course().id;
    const version = this.loadVersion;
    const ordered = this.lessonsFor(section.id);
    const index = ordered.findIndex(item => item.id === lesson.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const previous = this.lessons();
    const desired = this.swap(ordered.map(item => item.id), index, target);
    const positions = this.positionsOf(desired);
    const focusKey = this.reorderButtonKey('lesson', lesson.id, direction === -1 ? 'up' : 'down');
    const fallbackFocusKey = this.reorderButtonKey('lesson', lesson.id, direction === -1 ? 'down' : 'up');
    await this.runReorder(courseId, version, focusKey, fallbackFocusKey,
      target === 0 || target === ordered.length - 1,
      async () => {
        this.lessons.set(this.lessons().map(item => item.section_id === section.id
          ? { ...item, position: positions.get(item.id) ?? item.position } : item));
        await this.repository.reorderSectionLessons(section.id, desired);
      },
      () => this.lessons.set(previous),
      () => `Lección «${lesson.title}» movida a la posición ${(positions.get(lesson.id) ?? 0) + 1} de ${desired.length} en «${section.title}».`);
  }

  // --- Arrastrar y soltar (HTML5). El teclado sigue usando Subir/Bajar. ---

  dragSectionStart(event: DragEvent, section: Section): void {
    if (this.reorderPending || !this.orderedSections().some(item => item.id === section.id)) {
      event.preventDefault(); return;
    }
    this.dragging.set({ kind: 'section', id: section.id });
    this.dropTarget.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `section:${section.id}`);
    }
  }
  dragLessonStart(event: DragEvent, lesson: Lesson): void {
    if (this.reorderPending || !this.lessons().some(item => item.id === lesson.id)) {
      event.preventDefault(); return;
    }
    this.dragging.set({ kind: 'lesson', id: lesson.id, sectionId: lesson.section_id });
    this.dropTarget.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `lesson:${lesson.section_id}:${lesson.id}`);
    }
  }
  dragSectionEnter(event: DragEvent): void {
    if (this.dragging()?.kind === 'section' && !this.saving()) {
      event.preventDefault(); this.dropDepth++;
    }
  }
  dragLessonEnter(event: DragEvent, section: Section): void {
    const dragging = this.dragging();
    if (dragging && !this.saving() && (dragging.kind === 'section'
      || (dragging.kind === 'lesson' && dragging.sectionId === section.id))) {
      event.preventDefault(); this.dropDepth++;
    }
  }
  dragSectionOver(event: DragEvent, section: Section): void {
    const dragging = this.dragging();
    if (!dragging || dragging.kind !== 'section' || this.saving()) return;
    event.preventDefault();
    // No resaltar la propia fila de origen: solo es destino una fila distinta.
    this.dropTarget.set(dragging.id === section.id ? null : { kind: 'section', id: section.id });
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }
  dragLessonOver(event: DragEvent, section: Section, lesson: Lesson): void {
    const dragging = this.dragging();
    if (!dragging || this.saving()) return;
    if (dragging.kind === 'lesson' && dragging.sectionId !== section.id) return;
    event.preventDefault();
    if (dragging.id === lesson.id) {
      this.dropTarget.set(dragging.kind === 'section' ? { kind: 'section', id: section.id } : null);
    } else {
      this.dropTarget.set(dragging.kind === 'section'
        ? { kind: 'section', id: section.id }
        : { kind: 'lesson', id: lesson.id, sectionId: section.id });
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }
  dragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dropDepth = Math.max(0, this.dropDepth - 1);
    if (this.dropDepth === 0) this.dropTarget.set(null);
  }
  async dropSection(event: DragEvent, section: Section): Promise<void> {
    event.preventDefault();
    const dragging = this.dragging();
    const target = this.dropTarget();
    if (!dragging || this.reorderPending || !target || target.kind !== 'section'
      || target.id !== section.id || dragging.id === section.id) { this.cancelDrag(); return; }
    const index = this.orderedSections().findIndex(item => item.id === dragging.id);
    await this.reorderByDrop(index, target);
  }
  async dropLesson(event: DragEvent, section: Section, lesson: Lesson): Promise<void> {
    event.preventDefault();
    const dragging = this.dragging();
    const target = this.dropTarget();
    const expected: DropTarget = dragging?.kind === 'lesson'
      ? { kind: 'lesson', id: lesson.id, sectionId: section.id }
      : { kind: 'section', id: section.id };
    if (!dragging || this.reorderPending || !target || target.kind !== expected.kind
      || target.id !== expected.id || (target.kind === 'lesson' && dragging.kind === 'lesson'
        && target.sectionId !== dragging.sectionId) || dragging.id === lesson.id) { this.cancelDrag(); return; }
    const ids = this.currentIds();
    const index = ids ? ids.indexOf(dragging.id) : -1;
    await this.reorderByDrop(index, target);
  }
  dragEnd(): void { this.cancelDrag(); }
  ariaGrabbed(kind: 'section' | 'lesson', id: string): string {
    const dragging = this.dragging();
    return String(!!dragging && dragging.kind === kind && dragging.id === id);
  }
  dropEffect(kind: 'section' | 'lesson', id: string, sectionId?: string): 'move' | 'none' {
    const dragging = this.dragging();
    if (!dragging || this.saving()) return 'none';
    // La fila de origen nunca se ofrece como destino, tampoco al arrastrar bloques.
    if (dragging.kind === 'section') return id === dragging.id ? 'none' : 'move';
    return kind === 'lesson' && sectionId === dragging.sectionId && id !== dragging.id ? 'move' : 'none';
  }
  private currentIds(): string[] | null {
    const dragging = this.dragging();
    if (!dragging) return null;
    return dragging.kind === 'section'
      ? this.orderedSections().map(item => item.id)
      : this.lessonsFor(dragging.sectionId).map(item => item.id);
  }
  private reorderByDrop(fromIndex: number, target: DropTarget): Promise<void> | null {
    const ids = this.currentIds();
    const dragging = this.dragging();
    if (!ids || !dragging || fromIndex < 0 || fromIndex >= ids.length) return null;
    const targetIndex = ids.indexOf(target.id);
    if (targetIndex < 0 || targetIndex === fromIndex) return null;
    const desired = [...ids];
    const [moved] = desired.splice(fromIndex, 1);
    desired.splice(targetIndex, 0, moved);
    if (new Set(desired).size !== ids.length) return null;
    const positions = this.positionsOf(desired);
    const courseId = this.course().id;
    const version = this.loadVersion;
    const previousSections = this.sections();
    const previousLessons = this.lessons();
    const apply: () => Promise<void> = dragging.kind === 'section'
      ? async () => {
        this.sections.set(previousSections.map(item => ({ ...item, position: positions.get(item.id) ?? item.position })));
        await this.repository.reorderCourseSections(courseId, desired);
      }
      : async () => {
        this.lessons.set(previousLessons.map(item => item.section_id === dragging.sectionId
          ? { ...item, position: positions.get(item.id) ?? item.position } : item));
        await this.repository.reorderSectionLessons(dragging.sectionId, desired);
      };
    const rollback: () => void = dragging.kind === 'section'
      ? () => this.sections.set(previousSections)
      : () => this.lessons.set(previousLessons);
    const noticeText = dragging.kind === 'section'
      ? `Bloque movido a la posición ${targetIndex + 1} de ${desired.length}.`
      : `Lección movida a la posición ${targetIndex + 1} de ${desired.length}.`;
    this.dropTarget.set(null);
    const run = this.runReorder(courseId, version, '', '', false, apply, rollback, () => noticeText);
    this.dragging.set(null);
    return run;
  }

  private focus(target: 'heading' | 'section' | 'lesson'): void {
    if (this.destroyRef.destroyed) return;
    afterNextRender(() => {
      if (this.destroyRef.destroyed) return;
      const element = target === 'heading' ? this.heading()
        : target === 'section' ? this.sectionInput() : this.lessonInput();
      this.focusVisible(element?.nativeElement, target !== 'heading');
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
    const selection = this.selected();
    this.sectionEditor.set(null); this.lessonEditor.set(null); this.selected.set(null);
    this.activeTab.set('datos');
    this.error.set(''); this.clearValidation();
    if (selection) this.focusOutline(this.outlineKey(selection.kind, selection.id));
    else this.focus('heading');
  }
  editSection(section?: Section): void {
    if (this.saving()) return;
    this.lessonEditor.set(null);
    this.sectionTitle = section?.title ?? '';
    this.sectionSummary = section?.summary ?? '';
    this.activeTab.set('datos');
    this.clearValidation(); this.error.set('');
    this.sectionEditor.set(section ?? 'new');
    this.selected.set(section ? { kind: 'section', id: section.id } : null);
    this.focus('section');
  }
  editLesson(section: Section, lesson?: Lesson): void {
    if (this.saving()) return;
    this.sectionEditor.set(null);
    this.lessonTitle = lesson?.title ?? '';
    this.contentType = lesson ? lesson.content_type : 'video';
    this.preview = lesson?.is_free_preview ?? false; this.published = lesson?.is_published ?? false;
    this.activeTab.set('datos');
    this.clearValidation(); this.error.set(''); this.lessonEditor.set({ section, lesson });
    this.selected.set(lesson ? { kind: 'lesson', id: lesson.id, sectionId: section.id } : null);
    if (lesson) this.expandSection(section.id);
    this.focus('lesson');
  }
  async saveSection(): Promise<void> {
    if (this.saving()) return;
    const editor = this.sectionEditor();
    const title = this.sectionTitle.trim();
    if (!editor) return;
    this.invalid.update(v => ({ ...v, sectionTitle: !title || [...title].length > 120 }));
    if (this.invalid().sectionTitle) return;
    const courseId = this.course().id;
    const version = this.loadVersion;
    const previousIds = new Set(this.sections().map(section => section.id));
    this.saving.set(true); this.error.set(''); this.notice.set('');
    try {
      await this.repository.saveSection(courseId,
        { title, summary: typeof editor === 'string' ? null : editor.summary },
        Math.max(-1, ...this.sections().map(s => s.position)) + 1, typeof editor === 'string' ? undefined : editor);
      if (!this.reorderIsCurrent(version, courseId)) return;
      await this.load();
      if (!this.reorderIsCurrent(version + 1, courseId)) return;
      if (this.loadFailed()) return;
      const saved = this.sections().find(section => !previousIds.has(section.id))
        ?? (typeof editor === 'string' ? undefined : this.sections().find(section => section.id === editor.id));
      this.notice.set('Bloque guardado.');
      if (saved) {
        this.sectionEditor.set(saved);
        this.selected.set({ kind: 'section', id: saved.id });
        this.focusOutline(this.outlineKey('section', saved.id));
      } else {
        this.sectionEditor.set(null);
        this.selected.set(null);
        this.focus('heading');
      }
    } catch {
      if (!this.destroyRef.destroyed && this.reorderIsCurrent(version, courseId)) {
        this.error.set('No se ha podido guardar el bloque. Comprueba la conexión y tus permisos.');
      }
    } finally { if (!this.destroyRef.destroyed) this.saving.set(false); }
  }
  async saveLesson(): Promise<void> {
    if (this.saving()) return;
    const editor = this.lessonEditor(); const title = this.lessonTitle.trim();
    if (!editor) return;
    this.invalid.update(v => ({ ...v, lessonTitle: !title || [...title].length > 160,
      contentType: !isLessonContentType(this.contentType) }));
    if (this.invalid().lessonTitle || !isLessonContentType(this.contentType)) return;
    const courseId = this.course().id;
    const version = this.loadVersion;
    const previousIds = new Set(this.lessons().map(lesson => lesson.id));
    this.saving.set(true); this.error.set(''); this.notice.set('');
    try {
      await this.repository.saveLesson(courseId, editor.section.id, {
        title, content_type: this.contentType, is_free_preview: this.preview, is_published: this.published,
      }, Math.max(-1, ...this.lessons().filter(l => l.section_id === editor.section.id).map(l => l.position)) + 1,
      editor.lesson, editor.lesson ? undefined : lessonSlug(title, this.lessons()));
      if (!this.reorderIsCurrent(version, courseId)) return;
      await this.load();
      if (!this.reorderIsCurrent(version + 1, courseId)) return;
      if (this.loadFailed()) return;
      const saved = this.lessons().find(lesson => !previousIds.has(lesson.id))
        ?? (editor.lesson ? this.lessons().find(lesson => lesson.id === editor.lesson!.id) : undefined);
      this.notice.set('Lección guardada.');
      if (saved) {
        this.expandSection(saved.section_id);
        this.lessonEditor.set({ section: editor.section, lesson: saved });
        this.selected.set({ kind: 'lesson', id: saved.id, sectionId: saved.section_id });
        this.focusOutline(this.outlineKey('lesson', saved.id));
      } else {
        this.lessonEditor.set(null);
        this.selected.set(null);
        this.focus('heading');
      }
    } catch (error) {
      if (!this.destroyRef.destroyed && this.reorderIsCurrent(version, courseId)) {
        this.error.set(error instanceof Error && error.message === 'save_conflict'
          ? 'No se ha podido guardar por un conflicto. Recarga la estructura y vuelve a intentarlo.'
          : 'No se ha podido guardar la lección. Comprueba la conexión y tus permisos.');
      }
    } finally { if (!this.destroyRef.destroyed) this.saving.set(false); }
  }
}
