import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PerfilRepository } from './perfil-repository';

@Component({
  imports: [FormsModule, RouterLink],
  templateUrl: './perfil.html',
  styleUrl: './perfil.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Perfil implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly repository = inject(PerfilRepository);
  private readonly userId = computed(() => this.auth.status() === 'authenticated'
    ? this.auth.session()?.user.id ?? null : null);
  private generation = 0;
  private destroyed = false;
  readonly name = signal('');
  readonly state = signal<'idle' | 'loading' | 'ready' | 'saving' | 'error'>('idle');
  readonly message = signal('');

  constructor() {
    effect(() => {
      const id = this.userId();
      untracked(() => {
        const generation = ++this.generation;
        this.name.set('');
        this.message.set('');
        if (!id) {
          this.state.set('idle');
          return;
        }
        this.state.set('loading');
        void this.load(id, generation);
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.generation++;
  }

  private current(id: string, generation: number): boolean {
    return !this.destroyed && generation === this.generation && this.userId() === id;
  }

  private async load(id: string, generation: number): Promise<void> {
    try {
      const name = await this.repository.load(id);
      if (!this.current(id, generation)) return;
      this.name.set(name ?? '');
      this.state.set('ready');
    } catch {
      if (!this.current(id, generation)) return;
      this.state.set('error');
      this.message.set('No se pudo cargar el perfil. Vuelve a intentarlo.');
    }
  }

  retry(): void {
    const id = this.userId();
    if (!id) return;
    this.state.set('loading');
    this.message.set('');
    void this.load(id, ++this.generation);
  }

  async save(): Promise<void> {
    const id = this.userId();
    if (!id || this.state() !== 'ready') return;
    const name = this.name().trim();
    if (Array.from(name).length > 60) {
      this.message.set('El nombre visible no puede superar 60 caracteres.');
      return;
    }
    const generation = ++this.generation;
    this.state.set('saving');
    this.message.set('');
    try {
      const saved = await this.repository.save(id, name || null);
      if (!this.current(id, generation)) return;
      this.name.set(saved ?? '');
      this.state.set('ready');
      this.message.set('Nombre visible guardado.');
    } catch {
      if (!this.current(id, generation)) return;
      this.state.set('ready');
      this.message.set('No se pudo guardar el nombre visible. Vuelve a intentarlo.');
    }
  }
}
