import { Component, inject, input } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';
import { ConversationRepository } from './conversation';
import { ConversationView } from './conversation-view';
import { LessonCommentsRepository } from './lesson-comments-repository';

/**
 * Wrapper delgado de las dudas de una lección. Conserva la entrada `lessonId`
 * y el repositorio histórico (y su seguridad) sin cambiar su contrato: adapta
 * su `create(lessonId, body, parentId)` al puerto compartido de conversación.
 * La UI recursiva vive en `ConversationView` y es la misma que usa el foro.
 */
@Component({
  selector: 'app-lesson-comments',
  imports: [ConversationView],
  templateUrl: './lesson-comments.html',
  styleUrl: './lesson-comments.scss',
})
export class LessonComments {
  readonly lessonId = input.required<string>();

  private readonly lessonRepository = inject(LessonCommentsRepository);

  /** Solo el contenedor decide si se ofrece moderación; la RPC la verifica. */
  readonly auth = inject(AuthService);

  readonly conversation: ConversationRepository = {
    list: (scopeId: string) => this.lessonRepository.list(scopeId),
    create: (scopeId: string, body: string, parentId: string | null = null) =>
      this.lessonRepository.create(scopeId, body, parentId),
    deleteComment: (id: string) => this.lessonRepository.deleteComment(id),
  };

  /** Sin rol resuelto (o mocks parciales) no se ofrece moderación. */
  canModerate(): boolean {
    return typeof this.auth.isAdmin === 'function' && this.auth.isAdmin() === true;
  }
}
