import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ConversationView } from '../comentarios/conversation-view';
import { ForumModerationState } from './forum-moderation-state';
import { ForumThreadRepository } from './forum-thread-repository';

/** Un hilo reutiliza la vista de conversación: no hay una segunda UI de respuestas. */
@Component({
  selector: 'app-forum-thread',
  imports: [RouterLink, ConversationView],
  templateUrl: './forum-thread.html',
  styleUrl: './forum-thread.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForumThread {
  private readonly route = inject(ActivatedRoute);
  readonly repository = inject(ForumThreadRepository);
  private readonly moderation = inject(ForumModerationState);
  /** Solo el contenedor decide si se ofrece moderación; la RPC la verifica. */
  readonly auth = inject(AuthService);
  readonly categoryId = this.route.snapshot.paramMap.get('categoryId') ?? '';
  readonly threadId = this.route.snapshot.paramMap.get('threadId') ?? '';
  readonly threadDeleted = signal(false);

  /** Sin rol resuelto (o mocks parciales) no se ofrece moderación. */
  canModerate(): boolean {
    return typeof this.auth.isAdmin === 'function' && this.auth.isAdmin() === true;
  }

  /** El hilo ya no existe: se marca para la lista y se ofrece la vuelta. */
  onThreadDeleted(threadId: string): void {
    this.moderation.markThreadDeleted(threadId);
    this.threadDeleted.set(true);
  }
}
