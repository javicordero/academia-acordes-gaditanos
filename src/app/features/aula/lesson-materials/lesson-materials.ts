import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources, PdfResource } from '../../../shared/lesson-resources/lesson-resources';

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
  readonly state = signal<'loading' | 'unconfigured' | 'anonymous' | 'error' | 'ready'>('loading');
  readonly items = signal<PdfResource[]>([]);
  readonly pending = signal<Record<string, boolean>>({});
  readonly links = signal<Record<string, string>>({});
  readonly errors = signal<Record<string, boolean>>({});
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
      }).catch(() => {
        if (this.current(generation, key)) this.state.set('error');
      });
    });
  }

  async prepare(item: PdfResource): Promise<void> {
    if (this.pending()[item.id] || !this.items().some(i => i.id === item.id) || this.auth.status() !== 'authenticated' || !this.auth.session()) return;
    const generation = this.generation;
    const key = this.identity();
    const started = Date.now();
    this.removeLink(item.id);
    this.pending.update(value => ({ ...value, [item.id]: true }));
    this.errors.update(value => ({ ...value, [item.id]: false }));
    try {
      const url = await this.resources.download(this.lessonId(), item.id);
      const remaining = 60_000 - (Date.now() - started);
      if (!this.current(generation, key)) return;
      if (remaining <= 0 || !this.validUrl(url, item.id)) throw new Error('Enlace no válido');
      this.links.update(value => ({ ...value, [item.id]: url }));
      this.timers.set(item.id, setTimeout(() => this.removeLink(item.id), remaining));
    } catch {
      if (this.current(generation, key)) this.errors.update(value => ({ ...value, [item.id]: true }));
    } finally {
      if (this.current(generation, key)) this.pending.update(value => ({ ...value, [item.id]: false }));
    }
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
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.links.update(value => { const next = { ...value }; delete next[id]; return next; });
  }
  private clear(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.items.set([]); this.links.set({}); this.pending.set({}); this.errors.set({});
  }
}
