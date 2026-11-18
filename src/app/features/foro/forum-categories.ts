import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ForumCategory, ForumThreadRepository } from './forum-thread-repository';

@Component({
  selector: 'app-forum-categories',
  imports: [RouterLink],
  templateUrl: './forum-categories.html',
  styleUrl: './forum-categories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumCategories {
  private readonly repository = inject(ForumThreadRepository);
  private request = 0;
  private destroyed = false;

  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly categories = signal<readonly ForumCategory[]>([]);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
    });
    void this.load();
  }

  /** Reintento explícito; la carga inicial no publica ni escribe nada. */
  load(): void {
    const request = ++this.request;
    this.state.set('loading');
    this.categories.set([]);
    void this.repository.listCategories().then((rows) => {
      if (this.destroyed || request !== this.request) return;
      this.categories.set(rows);
      this.state.set('ready');
    }).catch(() => {
      if (this.destroyed || request !== this.request) return;
      this.categories.set([]);
      this.state.set('error');
    });
  }
}
