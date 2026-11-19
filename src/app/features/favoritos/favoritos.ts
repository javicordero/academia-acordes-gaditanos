import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { SkeletonBlock } from '../../shared/skeleton/skeleton';
import { FavoriteGroup, LessonFavorite, groupFavorites } from './lesson-favorite';
import { LessonFavoritesRepository } from './repository';

@Component({
  selector: 'app-favoritos',
  imports: [RouterLink, SkeletonBlock],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './favoritos.html',
  styleUrl: './favoritos.scss',
})
export class FavoritesPage {
  private readonly repository = inject(LessonFavoritesRepository);
  private readonly auth = inject(AuthService);
  private request = 0;
  private destroyed = false;
  private loadedIdentity = '';

  readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  readonly retrying = signal(false);
  private readonly rows = signal<readonly LessonFavorite[]>([]);
  readonly groups = computed<readonly FavoriteGroup[]>(() => groupFavorites(this.rows()));

  /** Cambiar de cuenta descarta la lista anterior y sus respuestas en curso. */
  private readonly identity = computed(() => {
    const status = this.auth.status();
    if (status !== 'authenticated') return status;
    return `authenticated:${this.auth.session()?.user.id ?? ''}`;
  });
  readonly signedOut = computed(() => this.auth.status() !== 'authenticated');

  constructor() {
    effect(() => {
      const identity = this.identity();
      untracked(() => void this.load(identity));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
    });
  }

  retry(): void {
    if (this.state() !== 'error' || this.retrying() || this.signedOut()) return;
    this.retrying.set(true);
    this.loadedIdentity = '';
    void this.load(this.identity()).finally(() => {
      if (!this.destroyed) this.retrying.set(false);
    });
  }

  private async load(identity: string): Promise<void> {
    if (this.auth.status() !== 'authenticated') {
      this.request++;
      this.loadedIdentity = '';
      this.rows.set([]);
      this.retrying.set(false);
      this.state.set('empty');
      return;
    }
    if (identity === this.loadedIdentity) return;

    this.loadedIdentity = identity;
    const request = ++this.request;
    this.rows.set([]);
    this.retrying.set(false);
    this.state.set('loading');

    try {
      const favorites = await this.repository.list();
      if (this.destroyed || request !== this.request) return;
      this.rows.set(favorites);
      this.state.set(favorites.length ? 'ready' : 'empty');
    } catch {
      if (this.destroyed || request !== this.request) return;
      this.rows.set([]);
      this.state.set('error');
    }
  }
}
