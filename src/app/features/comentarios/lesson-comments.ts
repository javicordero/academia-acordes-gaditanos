import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  LessonComment,
  MAX_COMMENT_LENGTH,
  shouldHideComments,
} from './lesson-comment';
import { LessonCommentsRepository } from './lesson-comments-repository';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type CommentsState = 'loading' | 'ready' | 'hidden' | 'error';

/** Niveles que llegan a indentarse; el resto se dibuja sin desplazamiento extra. */
const MAX_INDENT_DEPTH = 4;

export interface CommentNode {
  readonly comment: LessonComment;
  readonly children: readonly CommentNode[];
}

/**
 * Árbol completo a partir de `parent_id`, sin límite de profundidad. Las raíces
 * y cada lista de hermanos se ordenan por `created_at` (con `id` como desempate).
 * Una fila huérfana se trata como raíz para que no desaparezca de la vista; los
 * ciclos se cortan para que un dato inesperado no bloquee el render.
 */
export function buildCommentTree(rows: readonly LessonComment[]): readonly CommentNode[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, LessonComment[]>();
  const roots: LessonComment[] = [];

  for (const row of rows) {
    if (row.parentId === null || !byId.has(row.parentId)) {
      roots.push(row);
      continue;
    }
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }

  const byDate = (a: LessonComment, b: LessonComment): number =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  roots.sort(byDate);
  for (const siblings of children.values()) siblings.sort(byDate);

  const visited = new Set<string>();
  const build = (row: LessonComment): CommentNode => {
    visited.add(row.id);
    const descendants = (children.get(row.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(build);
    return { comment: row, children: descendants };
  };

  return roots.filter((row) => !visited.has(row.id)).map(build);
}

/**
 * Conversación de una lección. Es el único servicio de comentarios: se usa
 * igual en el aula del alumno y en la vista previa de administración. La
 * autoridad está en la RPC/RLS; esta UI solo muestra lo que el servidor entrega.
 */
@Component({
  selector: 'app-lesson-comments',
  imports: [NgClass, NgTemplateOutlet],
  templateUrl: './lesson-comments.html',
  styleUrl: './lesson-comments.scss',
})
export class LessonComments {
  private static nextId = 0;

  readonly lessonId = input.required<string>();
  readonly maxLength = MAX_COMMENT_LENGTH;
  readonly uid = `lc-${++LessonComments.nextId}`;
  readonly headingId = `${this.uid}-titulo`;
  readonly rootInputId = `${this.uid}-cuerpo`;
  readonly replyInputId = `${this.uid}-respuesta`;
  readonly rootHintId = `${this.uid}-pista`;
  readonly replyHintId = `${this.uid}-pista-respuesta`;

  private readonly repository = inject(LessonCommentsRepository);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private request = 0;
  private destroyed = false;
  private loadedLessonId: string | null = null;

  readonly state = signal<CommentsState>('loading');
  readonly comments = signal<readonly LessonComment[]>([]);
  readonly tree = computed(() => buildCommentTree(this.comments()));
  readonly draft = signal('');
  readonly draftError = signal('');
  readonly replyTo = signal<string | null>(null);
  readonly replyDraft = signal('');
  readonly publishing = signal(false);
  readonly publishError = signal('');
  readonly success = signal('');
  readonly canPublishRoot = computed(() => this.validBody(this.draft()));
  readonly canPublishReply = computed(() => this.validBody(this.replyDraft()));

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
    });

    // Cargar al entrar, una sola vez por lección. Los efectos nunca publican.
    effect(() => {
      const lessonId = this.lessonId();
      if (!lessonId || lessonId === this.loadedLessonId) return;
      this.load(lessonId);
    });
  }

  private validBody(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.length >= 1 && trimmed.length <= MAX_COMMENT_LENGTH;
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : DATE_FORMATTER.format(date);
  }

  /** Clase de sangrado: la profundidad sigue intacta en datos, solo se deja de indentar. */
  indentClass(depth: number): string {
    return depth > MAX_INDENT_DEPTH ? 'depth-cap' : `depth-${depth}`;
  }

  onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
    this.draftError.set('');
  }

  onReplyInput(event: Event): void {
    this.replyDraft.set((event.target as HTMLTextAreaElement).value);
    this.publishError.set('');
  }

  /** Reintento explícito tras un fallo de red; no se dispara desde un effect. */
  reload(): void {
    const lessonId = this.lessonId();
    if (lessonId) this.load(lessonId);
  }

  private load(lessonId: string): void {
    this.loadedLessonId = lessonId;
    const request = ++this.request;
    // Una publicación en vuelo de otra lección queda descartada por `request`;
    // su `finally` no debe dejar el formulario de esta lección deshabilitado.
    this.publishing.set(false);
    this.state.set('loading');
    this.comments.set([]);
    this.draft.set('');
    this.draftError.set('');
    this.replyTo.set(null);
    this.replyDraft.set('');
    this.publishError.set('');
    this.success.set('');

    void this.repository.list(lessonId).then((rows) => {
      if (this.destroyed || request !== this.request) return;
      this.comments.set(rows);
      this.state.set('ready');
    }).catch((error: unknown) => {
      if (this.destroyed || request !== this.request) return;
      this.comments.set([]);
      this.state.set(shouldHideComments(error) ? 'hidden' : 'error');
    });
  }

  startReply(commentId: string): void {
    this.replyTo.set(commentId);
    this.replyDraft.set('');
    this.publishError.set('');
    // El editor vive en una plantilla recursiva: buscar por id es inequívoco
    // aunque haya varios niveles y solo un formulario abierto a la vez.
    afterNextRender(() => {
      this.host.nativeElement
        .querySelector<HTMLTextAreaElement>(`[id="${this.replyInputId}"]`)
        ?.focus();
    }, { injector: this.injector });
  }

  cancelReply(): void {
    this.replyTo.set(null);
    this.replyDraft.set('');
  }

  async publishRoot(event: Event): Promise<void> {
    event.preventDefault();
    if (this.publishing()) return;
    const body = this.draft();
    if (!this.validBody(body)) {
      this.draftError.set('Escribe entre 1 y 2000 caracteres.');
      return;
    }
    await this.publish(body.trim(), null, 'comment');
  }

  async publishReply(event: Event): Promise<void> {
    event.preventDefault();
    const parentId = this.replyTo();
    if (this.publishing() || !parentId) return;
    const body = this.replyDraft();
    if (!this.validBody(body)) {
      this.publishError.set('Escribe entre 1 y 2000 caracteres.');
      return;
    }
    await this.publish(body.trim(), parentId, 'reply');
  }

  private async publish(
    body: string,
    parentId: string | null,
    kind: 'comment' | 'reply',
  ): Promise<void> {
    const lessonId = this.lessonId();
    const request = this.request;
    this.publishing.set(true);
    this.publishError.set('');
    this.success.set('');
    try {
      const created = await this.repository.create(lessonId, body, parentId);
      if (this.destroyed || request !== this.request) return;
      // Se reutiliza la fila devuelta: el árbol se recalcula y el mensaje
      // aparece en su sitio sin pedir la lista de nuevo.
      this.comments.update((rows) => [...rows, created]);
      if (kind === 'comment') {
        this.draft.set('');
        this.draftError.set('');
      } else {
        this.replyTo.set(null);
        this.replyDraft.set('');
      }
      this.success.set(kind === 'reply' ? 'Respuesta publicada.' : 'Comentario publicado.');
      this.focusPublished(created.id);
    } catch (error: unknown) {
      if (this.destroyed || request !== this.request) return;
      // Solo un rechazo real de permisos oculta la conversación. Un `invalid`
      // (forma de fila inesperada) es un fallo de publicación: se informa con
      // `publishError` y la sección sigue visible, sin recargar ni ocultar.
      if (shouldHideComments(error)) {
        this.state.set('hidden');
        return;
      }
      this.publishError.set(
        kind === 'reply'
          ? 'No se pudo publicar la respuesta. Inténtalo de nuevo.'
          : 'No se pudo publicar el comentario. Inténtalo de nuevo.',
      );
    } finally {
      if (!this.destroyed && request === this.request) this.publishing.set(false);
    }
  }

  /** Lleva el foco al mensaje recién publicado, sin robarlo durante la carga. */
  private focusPublished(commentId: string): void {
    afterNextRender(() => {
      const node = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-comment-id="${commentId}"]`,
      );
      node?.focus();
    }, { injector: this.injector });
  }
}
