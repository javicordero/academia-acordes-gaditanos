import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ConversationView } from '../comentarios/conversation-view';
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
  readonly categoryId = this.route.snapshot.paramMap.get('categoryId') ?? '';
  readonly threadId = this.route.snapshot.paramMap.get('threadId') ?? '';
}
