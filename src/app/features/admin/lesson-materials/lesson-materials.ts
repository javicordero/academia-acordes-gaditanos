import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources, PdfResource } from '../../../shared/lesson-resources/lesson-resources';

@Component({
  selector: 'app-lesson-materials', imports: [FormsModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="materials-heading">
      <h3 #heading id="materials-heading" tabindex="-1">Materiales PDF · {{ lessonTitle() }}</h3>
      <button type="button" (click)="closed.emit()">Volver a estructura</button>
      <p aria-live="polite">{{ status() }}</p>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (loading()) { <p role="status">Cargando materiales…</p> }
      @else {
        @if (listFailed()) { <button type="button" [disabled]="loading() || busy()" (click)="reload()">Recargar lista</button> }
        @else if (!items().length) { <p>No hay materiales PDF.</p> }
        @else { <ul>@for (item of items(); track item.id) { <li>{{ item.title }}</li> }</ul> }
      }
      <form (ngSubmit)="submit()" novalidate>
        <fieldset [disabled]="busy() || !!pending() || !!publishedPendingRefresh()"><legend>Añadir PDF</legend>
          <label for="pdf-title">Título</label>
          <input id="pdf-title" name="title" [(ngModel)]="title" (ngModelChange)="invalidTitle.set(false)" maxlength="160" required [attr.aria-invalid]="invalidTitle()" [attr.aria-describedby]="invalidTitle() ? 'pdf-title-error' : null">
          @if (invalidTitle()) { <p id="pdf-title-error">Indica un título de hasta 160 caracteres sin caracteres de control.</p> }
          <label for="pdf-file">Archivo PDF (máximo 10 MiB)</label>
          <input #fileInput id="pdf-file" type="file" accept="application/pdf,.pdf" (change)="selectFile($event)" required [attr.aria-invalid]="invalidFile()" [attr.aria-describedby]="invalidFile() ? 'pdf-file-error' : null">
          @if (invalidFile()) { <p id="pdf-file-error">Selecciona un PDF no vacío de hasta 10 MiB. El nombre debe usar letras sin acentos, números, puntos o guiones.</p> }
          <button type="submit">Subir PDF</button>
        </fieldset>
      </form>
      @if (pending()) {
        <p role="status">Hay una reserva pendiente. La publicación no está confirmada.</p>
        <button type="button" [disabled]="busy()" (click)="retry()">Reintentar validación</button>
      }
    </section>`,
  styles: `fieldset { display: grid; gap: .5rem; } section { margin-block: 1rem; }`
})
export class LessonMaterials {
  readonly courseId = input.required<string>(); readonly lessonId = input.required<string>(); readonly lessonTitle = input.required<string>();
  readonly closed = output<void>();
  private readonly service = inject(LessonResources); private readonly auth = inject(AuthService); private readonly destroy = inject(DestroyRef);
  private readonly userId = computed(() => this.auth.session()?.user.id);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  focusHeading(): void { this.heading()?.nativeElement.focus(); }
  readonly items = signal<PdfResource[]>([]); readonly loading = signal(false); readonly listFailed = signal(false);
  readonly busy = signal(false); readonly status = signal(''); readonly error = signal(''); readonly pending = signal<string | null>(null);
  readonly publishedPendingRefresh = signal<string | null>(null);
  readonly invalidTitle = signal(false); readonly invalidFile = signal(false);
  title = ''; private file: File | null = null; private generation = 0;
  constructor() {
    effect(() => {
      const course = this.courseId(), lesson = this.lessonId(), user = this.userId();
      const version = ++this.generation;
      this.items.set([]); this.error.set(''); this.status.set(''); this.pending.set(null); this.publishedPendingRefresh.set(null); this.busy.set(false); this.file = null; this.title = '';
      this.invalidTitle.set(false); this.invalidFile.set(false);
      untracked(() => { const fileInput = this.fileInput(); if (fileInput) fileInput.nativeElement.value = ''; });
      if (user) void this.load(version, course, lesson, user); else { this.loading.set(false); this.listFailed.set(true); }
    });
  }
  private current(v: number, c: string, l: string, u: string): boolean {
    return !this.destroy.destroyed && v === this.generation && this.courseId() === c && this.lessonId() === l && this.auth.session()?.user.id === u;
  }
  private async load(v: number, c: string, l: string, u: string): Promise<boolean> {
    this.loading.set(true); this.listFailed.set(false);
    try { const items = await this.service.list(l); if (!this.current(v,c,l,u)) return false; this.items.set(items); return true; }
    catch { if (this.current(v,c,l,u)) { this.listFailed.set(true); this.error.set('No se pudieron cargar los materiales.'); } return false; }
    finally { if (this.current(v,c,l,u)) this.loading.set(false); }
  }
  async reload(): Promise<void> {
    const u = this.auth.session()?.user.id, v = this.generation, c = this.courseId(), l = this.lessonId();
    if (!u || this.loading() || this.busy()) return;
    this.error.set('');
    const loaded = await this.load(v, c, l, u);
    if (loaded && this.current(v,c,l,u) && this.publishedPendingRefresh()) this.clearPublished();
  }
  selectFile(event: Event): void { this.file = (event.target as HTMLInputElement).files?.[0] ?? null; this.invalidFile.set(false); }
  async submit(): Promise<void> {
    if (this.busy() || this.pending() || this.publishedPendingRefresh()) return;
    const file = this.file, title = this.title.trim(), c = this.courseId(), l = this.lessonId(), u = this.auth.session()?.user.id, v = this.generation;
    if (!u) { this.error.set('Inicia sesión para continuar.'); return; }
    this.invalidTitle.set(!title || [...title].length > 160 || /[\x00-\x1f\x7f]/.test(title));
    this.invalidFile.set(!file || file.type !== 'application/pdf' || file.size < 1 || file.size > 10 * 1024 * 1024 || file.name.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/i.test(file.name));
    if (this.invalidTitle() || this.invalidFile() || !file) { this.error.set('Revisa los campos indicados.'); return; }
    this.busy.set(true); this.error.set(''); this.status.set('Preparando subida…');
    let id: string | null = null;
    try {
      const reservation = await this.service.prepare(c,l,title,file);
      if (!this.current(v,c,l,u)) return;
      id = reservation.resourceId; this.status.set('Subiendo archivo…');
      await this.service.upload(reservation,file);
      if (!this.current(v,c,l,u)) return;
      this.pending.set(id); this.status.set('Validando archivo…');
      await this.finish(v,c,l,u,id);
    } catch (e) {
      if (this.current(v,c,l,u)) { this.status.set(''); this.error.set(id ? 'No se pudo confirmar la subida. La publicación no está confirmada; puedes reintentar la validación.' : e instanceof Error ? e.message : 'No se pudo preparar la subida.'); if (id) this.pending.set(id); }
    } finally { if (this.current(v,c,l,u)) this.busy.set(false); }
  }
  async retry(): Promise<void> {
    const id = this.pending(), u = this.auth.session()?.user.id, c = this.courseId(), l = this.lessonId(), v = this.generation;
    if (!id || !u || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.status.set('Validando archivo…');
    try { await this.finish(v,c,l,u,id); }
    catch { if (this.current(v,c,l,u)) { this.status.set(''); this.error.set('No se pudo validar la reserva. La publicación no está confirmada.'); } }
    finally { if (this.current(v,c,l,u)) this.busy.set(false); }
  }
  private async finish(v: number,c: string,l: string,u: string,id: string): Promise<void> {
    await this.service.finalize(l,id);
    if (!this.current(v,c,l,u)) return;
    this.pending.set(null);
    this.publishedPendingRefresh.set(id);
    const loaded = await this.load(v,c,l,u);
    if (this.current(v,c,l,u)) {
      if (loaded) this.clearPublished();
      else this.status.set('PDF validado; recarga la lista antes de subir otro archivo.');
    }
  }
  private clearPublished(): void {
    this.publishedPendingRefresh.set(null); this.status.set('PDF validado y lista actualizada.');
    this.file = null; this.title = ''; const input = this.fileInput(); if (input) input.nativeElement.value = '';
  }
}
