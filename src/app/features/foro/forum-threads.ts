import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ForumModerationState } from './forum-moderation-state';
import {
  ForumThread,
  ForumThreadRepository,
  MAX_THREAD_TITLE_LENGTH,
  forumFailureMessage,
} from './forum-thread-repository';
import { MAX_CONVERSATION_LENGTH } from '../comentarios/conversation';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

@Component({
  selector: 'app-forum-threads',
  imports: [RouterLink],
  templateUrl: './forum-threads.html',
  styleUrl: './forum-threads.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumThreads {
  private readonly repository = inject(ForumThreadRepository);
  private readonly moderation = inject(ForumModerationState);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private request = 0;
  private destroyed = false;

  readonly categoryId = this.route.snapshot.paramMap.get('categoryId') ?? '';
  readonly maxTitle = MAX_THREAD_TITLE_LENGTH;
  readonly maxBody = MAX_CONVERSATION_LENGTH;
  readonly titleInputId = 'forum-thread-title';
  readonly bodyInputId = 'forum-thread-body';
  readonly titleErrorId = 'forum-thread-title-error';
  readonly bodyErrorId = 'forum-thread-body-error';

  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly threads = signal<readonly ForumThread[]>([]);
  /** Un hilo borrado en esta sesión no reaparece al volver a la categoría. */
  readonly visibleThreads = computed(() =>
    this.threads().filter((thread) => !this.moderation.deletedThreadIds().has(thread.id)),
  );
  readonly title = signal('');
  readonly body = signal('');
  readonly titleError = signal('');
  readonly bodyError = signal('');
  readonly formError = signal('');
  readonly creating = signal(false);
  readonly canCreate = computed(() =>
    !this.creating() && !!this.title().trim() && !!this.body().trim() &&
    this.title().trim().length <= MAX_THREAD_TITLE_LENGTH &&
    this.body().trim().length <= MAX_CONVERSATION_LENGTH,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
    });
    void this.load();
  }

  load(): void {
    const request = ++this.request;
    this.state.set('loading');
    this.threads.set([]);
    void this.repository.listThreads(this.categoryId).then((rows) => {
      if (this.destroyed || request !== this.request) return;
      this.threads.set(rows);
      this.state.set('ready');
    }).catch(() => {
      if (this.destroyed || request !== this.request) return;
      this.threads.set([]);
      this.state.set('error');
    });
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : DATE_FORMATTER.format(date);
  }

  onTitleInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
    this.titleError.set('');
    this.formError.set('');
  }

  onBodyInput(event: Event): void {
    this.body.set((event.target as HTMLTextAreaElement).value);
    this.bodyError.set('');
    this.formError.set('');
  }

  /** Solo este envío publica; cargar la pantalla nunca escribe en el foro. */
  async createThread(event: Event): Promise<void> {
    event.preventDefault();
    if (this.creating()) return;
    const title = this.title().trim();
    const body = this.body().trim();
    this.titleError.set('');
    this.bodyError.set('');
    this.formError.set('');

    if (!title || title.length > MAX_THREAD_TITLE_LENGTH) {
      this.titleError.set(`Escribe un título de 1 a ${MAX_THREAD_TITLE_LENGTH} caracteres.`);
      this.focusField(this.titleInputId);
      return;
    }
    if (!body || body.length > MAX_CONVERSATION_LENGTH) {
      this.bodyError.set(`Escribe un mensaje de 1 a ${MAX_CONVERSATION_LENGTH} caracteres.`);
      this.focusField(this.bodyInputId);
      return;
    }

    this.creating.set(true);
    try {
      const created = await this.repository.createThread(this.categoryId, title, body);
      if (this.destroyed) return;
      this.title.set('');
      this.body.set('');
      // Navegar al tema nuevo evita duplicar la lista y cualquier recarga.
      await this.router.navigate(['/comunidad', this.categoryId, created.id]);
    } catch (error: unknown) {
      if (this.destroyed) return;
      this.formError.set(forumFailureMessage(error));
    } finally {
      if (!this.destroyed) this.creating.set(false);
    }
  }

  private focusField(id: string): void {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>(`[id="${id}"]`)?.focus();
    }, { injector: this.injector });
  }
}
