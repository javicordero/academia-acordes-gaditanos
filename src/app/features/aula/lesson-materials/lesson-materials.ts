import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources, PdfResource } from '../../../shared/lesson-resources/lesson-resources';

/**
 * Material PDF de la lección. Los enlaces firmados se preparan automáticamente
 * al entrar, solo para los recursos de la lección actual ya autorizada, y se
 * ofrecen directamente como «Descargar PDF». No se descarga nada por sí solo:
 * el enlace es la acción final y única del alumno.
 *
 * El enlace dura 60 s (TTL del servidor). Al caducar se retira, pero el botón
 * sigue siendo «Descargar PDF»: dentro de ese único clic se pide una firma nueva
 * y se navega con la URL validada. El servidor envía Content-Disposition
 * attachment, así que el navegador guarda el archivo en el dispositivo; no se
 * promete apertura en pestaña ni vuelta con «Atrás». Sin ventanas emergentes
 * (que en Chrome real quedaron en about:blank), sin segundo clic y sin
 * renovación periódica.
 */
const TTL_MS = 60_000;
/** Breve bloqueo tras navegar: evita doble tap; luego libera sin efectos. */
const NAV_COOLDOWN_MS = 1_000;

@Component({
  selector: 'app-lesson-materials',
  imports: [RouterLink],
  templateUrl: './lesson-materials.html',
  styleUrl: './lesson-materials.scss',
})
export class LessonMaterials {
  readonly lessonId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly returnUrl = input.required<string>();
  readonly primary = input(false);
  private readonly auth = inject(AuthService);
  private readonly resources = inject(LessonResources);
  private readonly config = inject(SUPABASE_CONFIG);
  private generation = 0;
  private key = '';
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Bloqueo mientras se pide la firma; se libera al navegar o al fallar. */
  private readonly opening = new Set<string>();
  /** Cooldown posterior a la navegación: solo impide otro clic inmediato. */
  private readonly cooldowns = new Map<string, ReturnType<typeof setTimeout>>();
  readonly state = signal<'loading' | 'unconfigured' | 'anonymous' | 'error' | 'ready'>('loading');
  readonly items = signal<PdfResource[]>([]);
  /** URLs firmadas ya preparadas, por id de recurso. */
  readonly links = signal<Record<string, string>>({});
  readonly pending = signal<Record<string, boolean>>({});
  readonly errors = signal<Record<string, boolean>>({});
  /** Enlaces caducados retirados; se renuevan solo a petición del alumno. */
  readonly expired = signal<Record<string, boolean>>({});
  private readonly identity = computed(() => `${this.auth.status()}\0${this.auth.session()?.user.id ?? ''}\0${!this.auth.session() && !!this.auth.error()}\0${this.courseId()}\0${this.lessonId()}`);

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.generation++; this.clear(); });
    effect(() => {
      const key = this.identity();
      const authError = this.auth.error();
      if (key === this.key) return;
      this.key = key;
      const generation = ++this.generation;
      this.clear();
      const status = this.auth.status();
      if (status === 'loading') { this.state.set('loading'); return; }
      if (status === 'unconfigured') { this.state.set('unconfigured'); return; }
      if (!this.auth.session()) { this.state.set(authError ? 'error' : 'anonymous'); return; }
      this.state.set('loading');
      void this.resources.list(this.lessonId()).then(items => {
        if (!this.current(generation, key)) return;
        if (!Array.isArray(items)) throw new Error('Respuesta inválida');
        this.items.set(items);
        this.state.set('ready');
        // Preparar automáticamente los enlaces de los recursos ya listados.
        items.forEach(item => void this.prepare(item));
      }).catch(() => {
        if (this.current(generation, key)) this.state.set('error');
      });
    });
  }

  async prepare(item: PdfResource): Promise<void> {
    if (this.pending()[item.id] || !this.items().some(i => i.id === item.id) ||
        this.auth.status() !== 'authenticated' || !this.auth.session()) return;
    const generation = this.generation;
    const key = this.identity();
    const started = Date.now();
    this.removeLink(item.id);
    this.pending.update(value => ({ ...value, [item.id]: true }));
    this.errors.update(value => ({ ...value, [item.id]: false }));
    try {
      const url = await this.resources.download(this.lessonId(), item.id);
      const remaining = TTL_MS - (Date.now() - started);
      if (!this.current(generation, key)) return;
      if (remaining <= 0 || !this.validUrl(url, item.id)) throw new Error('Enlace no válido');
      this.storeLink(item, url, remaining);
    } catch {
      if (this.current(generation, key)) this.errors.update(value => ({ ...value, [item.id]: true }));
    } finally {
      if (this.current(generation, key)) this.pending.update(value => ({ ...value, [item.id]: false }));
    }
  }

  /**
   * Única acción del alumno: navega con la firma ya preparada o, si caducó,
   * pide una nueva dentro del clic y navega al terminar. Sin popup: en Chrome
   * real la ventana creada con `window.open` se quedó en about:blank y nunca
   * alcanzó Storage. La respuesta del servidor fuerza la descarga del archivo;
   * el cuerpo del PDF no se gestiona en el cliente.
   */
  async open(item: PdfResource): Promise<void> {
    // Solo se llama desde el botón; nunca desde la preparación automática,
    // temporizadores, expiración, señales ni respuestas tardías.
    if (this.opening.has(item.id) || this.cooldowns.has(item.id) || this.pending()[item.id] ||
        !this.items().some(i => i.id === item.id) ||
        this.auth.status() !== 'authenticated' || !this.auth.session()) return;
    const ready = this.links()[item.id];
    if (ready && this.validUrl(ready, item.id)) {
      this.opening.add(item.id);
      this.navigate(ready);
      this.opening.delete(item.id);
      this.startCooldown(item.id);
      return;
    }
    const generation = this.generation;
    const key = this.identity();
    this.opening.add(item.id);
    this.pending.update(value => ({ ...value, [item.id]: true }));
    this.errors.update(value => ({ ...value, [item.id]: false }));
    try {
      const url = await this.resources.download(this.lessonId(), item.id);
      if (!this.current(generation, key)) return;
      if (!this.validUrl(url, item.id)) throw new Error('Enlace no válido');
      this.storeLink(item, url, TTL_MS);
      this.navigate(url);
      this.startCooldown(item.id);
    } catch {
      this.opening.delete(item.id); // el error no abre; permite reintentar ya
      if (this.current(generation, key)) this.errors.update(value => ({ ...value, [item.id]: true }));
    } finally {
      this.opening.delete(item.id);
      if (this.current(generation, key)) this.pending.update(value => ({ ...value, [item.id]: false }));
    }
  }

  /**
   * El temporizador solo retira el bloqueo: no pide firmas, no navega y no
   * reintenta. La generación evita que un cooldown viejo libere el nuevo
   * recurso con el mismo id, y la identidad del timer evita solapamientos.
   */
  private startCooldown(id: string): void {
    const generation = this.generation;
    this.clearCooldown(id);
    const timer = setTimeout(() => {
      if (generation !== this.generation || this.cooldowns.get(id) !== timer) return;
      this.cooldowns.delete(id);
    }, NAV_COOLDOWN_MS);
    this.cooldowns.set(id, timer);
  }

  private clearCooldown(id: string): void {
    const timer = this.cooldowns.get(id);
    if (timer) clearTimeout(timer);
    this.cooldowns.delete(id);
  }

  /** Navegación aislada a la URL firmada para comprobarla sin descargar en las pruebas. */
  private navigate(url: string): void {
    window.location.assign(url);
  }

  /** Reintento tras error: la misma acción única vuelve a descargar el PDF. */
  retry(item: PdfResource): void {
    if (this.auth.status() !== 'authenticated' || !this.auth.session()) return;
    void this.open(item);
  }

  private storeLink(item: PdfResource, url: string, remaining: number): void {
    this.clearTimer(item.id);
    this.links.update(value => ({ ...value, [item.id]: url }));
    this.expired.update(value => ({ ...value, [item.id]: false }));
    this.timers.set(item.id, setTimeout(() => this.expire(item.id), remaining));
  }

  private validUrl(value: string, resourceId: string): boolean {
    try {
      const url = new URL(value);
      const origin = new URL(this.config.url);
      const local = origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
      return (url.protocol === 'https:' || local) && url.origin === origin.origin && !url.username && !url.password &&
        url.pathname === `/storage/v1/object/sign/lesson-pdfs/${this.courseId()}/${this.lessonId()}/${resourceId}/file.pdf` &&
        !!url.searchParams.get('token') && !url.hash;
    } catch { return false; }
  }
  private current(generation: number, key: string): boolean { return generation === this.generation && key === this.identity(); }
  private removeLink(id: string): void {
    this.clearTimer(id);
    this.links.update(value => { const next = { ...value }; delete next[id]; return next; });
    this.expired.update(value => { const next = { ...value }; delete next[id]; return next; });
  }
  /** Caducidad del enlace: se retira y queda la acción única de descarga. */
  private expire(id: string): void {
    if (!this.links()[id]) return;
    this.clearTimer(id);
    this.links.update(value => { const next = { ...value }; delete next[id]; return next; });
    this.expired.update(value => ({ ...value, [id]: true }));
  }
  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }
  private clear(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.opening.clear();
    this.cooldowns.forEach(timer => clearTimeout(timer));
    this.cooldowns.clear();
    this.items.set([]); this.links.set({}); this.pending.set({}); this.errors.set({}); this.expired.set({});
  }
}
