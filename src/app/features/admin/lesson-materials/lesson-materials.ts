import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SkeletonBlock } from '../../../shared/skeleton/skeleton';
import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources, PdfResource } from '../../../shared/lesson-resources/lesson-resources';

@Component({
  selector: 'app-lesson-materials', imports: [FormsModule, SkeletonBlock], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="materials-heading" class="materials-panel">
      <h3 #heading id="materials-heading" tabindex="-1">Materiales de la lección</h3>
      <p class="materials-context">Lección: {{ lessonTitle() }}</p>
      <button type="button" (click)="closed.emit()">Volver a estructura</button>
      <p class="materials-status" aria-live="polite">{{ status() }}</p>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (loading()) { <div aria-busy="true"><app-skeleton variant="list" ariaLabel="Cargando materiales…" /></div> }
      @else {
        @if (listFailed()) { <button type="button" [disabled]="loading() || busy()" (click)="reload()">Recargar lista</button> }
        @else if (!items().length) { <p>No hay materiales para esta lección.</p> }
        @else {
          <p>Descargar para abrirlo en tu equipo. Los enlaces caducan en un máximo de 60 segundos y pueden compartirse hasta entonces.</p>
          <ul>@for (item of items(); track item.id) { <li>
            <span>{{ item.title }}</span>
            <button type="button" [disabled]="downloadPending()[item.id]" (click)="prepareDownload(item)"
              [attr.aria-label]="'Preparar descarga ' + item.title + ' · ' + item.id">Preparar descarga</button>
            <span role="status" aria-live="polite" aria-atomic="true">
              @if (downloadPending()[item.id]) { Preparando descarga de {{ item.title }}… }
              @else if (downloadErrors()[item.id]) { No se pudo preparar la descarga de {{ item.title }}. Comprueba tu sesión y conexión e inténtalo de nuevo. }
              @else if (links()[item.id]) { Descarga lista: {{ item.title }}. }
            </span>
            @if (links()[item.id]; as link) {
              <a [href]="link" rel="noopener" download [attr.aria-label]="'Descargar PDF ' + item.title + ' · ' + item.id">Descargar PDF: {{ item.title }}</a>
            }
          </li> }</ul>
        }
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
        <p>Hay una reserva pendiente. La publicación no está confirmada.</p>
        <button type="button" [disabled]="busy()" (click)="retry()">Reintentar validación</button>
      }
    </section>`,
  styleUrl: './lesson-materials.scss'
})
export class LessonMaterials {
  /** IDs opcionales: los aporta el host al embeber el panel o la ruta histórica.
   *  `returnUrl` se acepta por compatibilidad; la navegación la decide el host. */
  readonly courseId = input(''); readonly lessonId = input(''); readonly lessonTitle = input('');
  readonly returnUrl = input('');
  readonly closed = output<void>();
  private readonly service = inject(LessonResources); private readonly auth = inject(AuthService); private readonly destroy = inject(DestroyRef);
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly userId = computed(() => this.auth.session()?.user.id);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  focusHeading(): void { this.heading()?.nativeElement.focus(); }
  readonly items = signal<PdfResource[]>([]); readonly loading = signal(false); readonly listFailed = signal(false);
  readonly busy = signal(false); readonly status = signal(''); readonly error = signal(''); readonly pending = signal<string | null>(null);
  readonly publishedPendingRefresh = signal<string | null>(null);
  readonly invalidTitle = signal(false); readonly invalidFile = signal(false);
  readonly links = signal<Record<string, string>>({});
  readonly downloadPending = signal<Record<string, boolean>>({});
  readonly downloadErrors = signal<Record<string, boolean>>({});
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  title = ''; private file: File | null = null; private generation = 0;
  constructor() {
    this.destroy.onDestroy(() => { this.generation++; this.clearDownloads(); });
    effect(() => {
      const course = this.courseId(), lesson = this.lessonId(), user = this.userId();
      const version = ++this.generation;
      this.clearDownloads();
      this.items.set([]); this.error.set(''); this.status.set(''); this.pending.set(null); this.publishedPendingRefresh.set(null); this.busy.set(false); this.file = null; this.title = '';
      this.invalidTitle.set(false); this.invalidFile.set(false);
      untracked(() => { const fileInput = this.fileInput(); if (fileInput) fileInput.nativeElement.value = ''; });
      if (user && course && lesson) void this.load(version, course, lesson, user);
      else { this.loading.set(false); this.listFailed.set(true); }
    });
  }
  private current(v: number, c: string, l: string, u: string): boolean {
    return !this.destroy.destroyed && v === this.generation && this.courseId() === c && this.lessonId() === l && this.auth.session()?.user.id === u;
  }
  private async load(v: number, c: string, l: string, u: string): Promise<boolean> {
    this.loading.set(true); this.listFailed.set(false);
    try { const items = await this.service.list(l); if (!this.current(v,c,l,u)) return false; this.items.set(items); return true; }
    catch { if (this.current(v,c,l,u)) { this.listFailed.set(true); this.error.set('No se pudieron cargar los materiales. Comprueba tu sesión, permisos y conexión; no se puede confirmar qué archivos aparecen en la lista.'); } return false; }
    finally { if (this.current(v,c,l,u)) this.loading.set(false); }
  }
  async prepareDownload(item: PdfResource): Promise<void> {
    const u = this.auth.session()?.user.id, c = this.courseId(), l = this.lessonId(), v = this.generation;
    if (!u || this.downloadPending()[item.id] || !this.items().some(i => i.id === item.id)) return;
    const started = Date.now();
    this.removeLink(item.id);
    this.downloadErrors.update(state => ({ ...state, [item.id]: false }));
    this.downloadPending.update(state => ({ ...state, [item.id]: true }));
    try {
      const url = await this.service.download(l, item.id);
      if (!this.current(v,c,l,u) || !this.items().some(i => i.id === item.id)) return;
      const remaining = 60_000 - (Date.now() - started);
      if (remaining <= 0 || !this.validUrl(url, c, l, item.id)) throw new Error('Enlace no válido');
      this.links.update(state => ({ ...state, [item.id]: url }));
      this.timers.set(item.id, setTimeout(() => this.removeLink(item.id), remaining));
    } catch {
      if (this.current(v,c,l,u)) this.downloadErrors.update(state => ({ ...state, [item.id]: true }));
    } finally {
      if (this.current(v,c,l,u)) this.downloadPending.update(state => ({ ...state, [item.id]: false }));
    }
  }
  private validUrl(value: string, course: string, lesson: string, resource: string): boolean {
    try {
      const url = new URL(value), origin = new URL(this.config.url);
      const local = origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
      return (url.protocol === 'https:' || local) && url.origin === origin.origin && !url.username && !url.password &&
        url.pathname === `/storage/v1/object/sign/lesson-pdfs/${course}/${lesson}/${resource}/file.pdf` &&
        !!url.searchParams.get('token') && !url.hash;
    } catch { return false; }
  }
  private removeLink(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.links.update(state => { const next = { ...state }; delete next[id]; return next; });
  }
  private clearDownloads(): void {
    this.timers.forEach(timer => clearTimeout(timer)); this.timers.clear();
    this.links.set({}); this.downloadPending.set({}); this.downloadErrors.set({});
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
