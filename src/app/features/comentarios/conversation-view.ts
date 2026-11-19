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
  output,
  signal,
} from '@angular/core';
import {
  ConversationPost,
  ConversationRepository,
  MAX_CONVERSATION_LENGTH,
  shouldHideConversation,
} from './conversation';
import { SkeletonBlock } from '../../shared/skeleton/skeleton';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

type ConversationState = 'loading' | 'ready' | 'hidden' | 'error';

/** Niveles que llegan a indentarse; el resto se dibuja sin desplazamiento extra. */
const MAX_INDENT_DEPTH = 4;

export interface ConversationNode {
  readonly post: ConversationPost;
  readonly children: readonly ConversationNode[];
  /** Es raíz solo si el servidor la creó sin padre (no si el árbol la promueve). */
  readonly isRoot: boolean;
}

/**
 * Árbol completo a partir de `parent_id`, sin límite de profundidad. Las raíces
 * y cada lista de hermanos se ordenan por `created_at` (con `id` como desempate).
 * Una fila huérfana se trata como raíz para que no desaparezca de la vista; los
 * ciclos se cortan para que un dato inesperado no bloquee el render.
 */
export function buildConversationTree(rows: readonly ConversationPost[]): readonly ConversationNode[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, ConversationPost[]>();
  const roots: ConversationPost[] = [];

  for (const row of rows) {
    if (row.parentId === null || !byId.has(row.parentId)) {
      roots.push(row);
      continue;
    }
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }

  const byDate = (a: ConversationPost, b: ConversationPost): number =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  roots.sort(byDate);
  for (const siblings of children.values()) siblings.sort(byDate);

  const visited = new Set<string>();
  const build = (row: ConversationPost): ConversationNode => {
    visited.add(row.id);
    const descendants = (children.get(row.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(build);
    return { post: row, children: descendants, isRoot: row.parentId === null };
  };

  const result = roots.filter((row) => !visited.has(row.id)).map(build);
  // Un ciclo no tiene raíz que lo alcance: se promueve un miembro a raíz y se
  // corta al volver a él, para que ningún mensaje desaparezca ni se cuelgue.
  for (const row of rows) {
    if (!visited.has(row.id)) result.push(build(row));
  }
  return result;
}

/**
 * Vista recursiva única de una conversación. La usan las dudas de lección y el
 * foro; el repositorio y el ámbito llegan como entradas, de modo que no existe
 * un segundo sistema de comentarios. La autoridad está en la RPC/RLS; esta UI
 * solo muestra lo que el servidor entrega.
 */
@Component({
  selector: 'app-conversation-view',
  imports: [NgClass, NgTemplateOutlet, SkeletonBlock],
  templateUrl: './conversation-view.html',
  styleUrl: './conversation-view.scss',
})
export class ConversationView {
  private static nextId = 0;

  readonly scopeId = input.required<string>();
  readonly repository = input.required<ConversationRepository>();

  /** Se emite solo cuando la RPC confirma que se borró el hilo completo. */
  readonly threadDeleted = output<string>();

  /**
   * La moderación se muestra solo cuando el contenedor lo autoriza (un admin).
   * No concede permiso: la RPC/RLS vuelve a comprobarlo en servidor.
   */
  readonly canModerate = input(false);
  /** Solo el foro borra el tema entero al eliminar el mensaje raíz. */
  readonly rootDeletesThread = input(true);
  readonly deleteConfirmText = input('¿Eliminar este comentario?');
  readonly deleteRepliesWarningText = input('Se borrarán también sus respuestas');
  readonly deleteThreadWarningText = input('Se borrará el hilo completo');
  readonly deleteConfirmButtonText = input('Confirmar eliminación');
  readonly deleteCancelButtonText = input('Cancelar');
  readonly deleteRetryButtonText = input('Reintentar');
  readonly commentDeletedText = input('Comentario eliminado');
  readonly threadDeletedText = input('Hilo eliminado');
  readonly deleteFailureText = input('No se pudo eliminar el comentario. Inténtalo de nuevo.');

  readonly heading = input('Comentarios de la lección');
  readonly emptyText = input('Todavía no hay comentarios en esta lección.');
  readonly placeholder = input('Escribe tu comentario');
  readonly rootLabel = input('Escribe tu comentario');
  readonly submitText = input('Publicar comentario');
  readonly replySubmitText = input('Publicar respuesta');
  readonly loadingText = input('Cargando comentarios…');
  readonly errorText = input('No se pudieron cargar los comentarios. Comprueba tu conexión e inténtalo de nuevo.');
  readonly lengthErrorText = input('Escribe entre 1 y 2000 caracteres.');
  readonly commentSuccessText = input('Comentario publicado.');
  readonly replySuccessText = input('Respuesta publicada.');
  readonly commentFailureText = input('No se pudo publicar el comentario. Inténtalo de nuevo.');
  readonly replyFailureText = input('No se pudo publicar la respuesta. Inténtalo de nuevo.');

  readonly maxLength = MAX_CONVERSATION_LENGTH;
  readonly uid = `cv-${++ConversationView.nextId}`;
  readonly headingId = `${this.uid}-titulo`;
  readonly rootInputId = `${this.uid}-cuerpo`;
  readonly replyInputId = `${this.uid}-respuesta`;
  readonly rootHintId = `${this.uid}-pista`;
  readonly replyHintId = `${this.uid}-pista-respuesta`;

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private request = 0;
  private destroyed = false;
  private loadedScopeId: string | null = null;
  private deleteTriggerButton: HTMLButtonElement | null = null;

  readonly state = signal<ConversationState>('loading');
  readonly posts = signal<readonly ConversationPost[]>([]);
  readonly tree = computed(() => buildConversationTree(this.posts()));
  readonly draft = signal('');
  readonly draftError = signal('');
  readonly replyTo = signal<string | null>(null);
  readonly replyDraft = signal('');
  readonly publishing = signal(false);
  readonly publishError = signal('');
  readonly success = signal('');
  readonly canPublishRoot = computed(() => this.validBody(this.draft()));
  readonly canPublishReply = computed(() => this.validBody(this.replyDraft()));

  readonly confirmingDeleteId = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly failedDeleteId = signal<string | null>(null);
  readonly deleteNotice = signal('');
  readonly deleteError = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
      this.resetModeration();
    });

    // Cargar al entrar, una sola vez por ámbito. Los efectos nunca publican.
    effect(() => {
      const scopeId = this.scopeId();
      if (!scopeId || scopeId === this.loadedScopeId) return;
      this.load(scopeId);
    });
  }

  private validBody(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.length >= 1 && trimmed.length <= MAX_CONVERSATION_LENGTH;
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
    const scopeId = this.scopeId();
    if (scopeId) this.load(scopeId);
  }

  private load(scopeId: string): void {
    this.loadedScopeId = scopeId;
    const request = ++this.request;
    // Una publicación en vuelo de otro ámbito queda descartada por `request`;
    // su `finally` no debe dejar el formulario de este hilo deshabilitado.
    this.publishing.set(false);
    this.state.set('loading');
    this.posts.set([]);
    this.draft.set('');
    this.draftError.set('');
    this.replyTo.set(null);
    this.replyDraft.set('');
    this.publishError.set('');
    this.success.set('');
    this.resetModeration();

    void this.repository().list(scopeId).then((rows) => {
      if (this.destroyed || request !== this.request) return;
      this.posts.set(rows);
      this.state.set('ready');
    }).catch((error: unknown) => {
      if (this.destroyed || request !== this.request) return;
      this.posts.set([]);
      this.state.set(shouldHideConversation(error) ? 'hidden' : 'error');
    });
  }

  startReply(postId: string): void {
    this.replyTo.set(postId);
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
      this.draftError.set(this.lengthErrorText());
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
      this.publishError.set(this.lengthErrorText());
      return;
    }
    await this.publish(body.trim(), parentId, 'reply');
  }

  private async publish(
    body: string,
    parentId: string | null,
    kind: 'comment' | 'reply',
  ): Promise<void> {
    const scopeId = this.scopeId();
    const request = this.request;
    this.publishing.set(true);
    this.publishError.set('');
    this.success.set('');
    try {
      const created = await this.repository().create(scopeId, body, parentId);
      if (this.destroyed || request !== this.request) return;
      // Se reutiliza la fila devuelta: el árbol se recalcula y el mensaje
      // aparece en su sitio sin pedir la lista de nuevo.
      this.posts.update((rows) => [...rows, created]);
      if (kind === 'comment') {
        this.draft.set('');
        this.draftError.set('');
      } else {
        this.replyTo.set(null);
        this.replyDraft.set('');
      }
      this.success.set(kind === 'reply' ? this.replySuccessText() : this.commentSuccessText());
      this.focusPublished(created.id);
    } catch (error: unknown) {
      if (this.destroyed || request !== this.request) return;
      // Solo un rechazo real de permisos oculta la conversación. Un `invalid`
      // (forma de fila inesperada) es un fallo de publicación: se informa con
      // `publishError` y la sección sigue visible, sin recargar ni ocultar.
      if (shouldHideConversation(error)) {
        this.state.set('hidden');
        return;
      }
      this.publishError.set(kind === 'reply' ? this.replyFailureText() : this.commentFailureText());
    } finally {
      if (!this.destroyed && request === this.request) this.publishing.set(false);
    }
  }

  /** Lleva el foco al mensaje recién publicado, sin robarlo durante la carga. */
  private focusPublished(postId: string): void {
    afterNextRender(() => {
      const node = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-comment-id="${postId}"]`,
      );
      node?.focus();
    }, { injector: this.injector });
  }

  private resetModeration(): void {
    this.confirmingDeleteId.set(null);
    this.deletingId.set(null);
    this.failedDeleteId.set(null);
    this.deleteNotice.set('');
    this.deleteError.set('');
    this.deleteTriggerButton = null;
  }

  /** Texto de la confirmación: avisa de respuestas y, si procede, del hilo raíz. */
  deleteWarningFor(node: ConversationNode): string {
    const parts: string[] = [];
    if (node.isRoot) {
      if (this.rootDeletesThread()) parts.push(this.deleteThreadWarningText());
      return parts.join('. ');
    }
    if (node.children.length > 0) parts.push(this.deleteRepliesWarningText());
    return parts.join('. ');
  }

  /** Paso 1: abre la confirmación en línea y lleva el foco a «Confirmar». */
  requestDelete(id: string, event: Event): void {
    if (!this.canModerate() || this.deletingId() !== null) return;
    this.deleteTriggerButton = (event.currentTarget as HTMLButtonElement | null) ?? null;
    this.deleteError.set('');
    this.failedDeleteId.set(null);
    this.confirmingDeleteId.set(id);
    this.focusAfterRender(`[data-delete-confirm="${id}"]`);
  }

  /** Paso 2: cancelar (botón o Escape) devuelve el foco a «Eliminar». */
  cancelDelete(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const trigger = this.deleteTriggerButton;
    this.confirmingDeleteId.set(null);
    this.failedDeleteId.set(null);
    this.deleteError.set('');
    this.deleteTriggerButton = null;
    if (trigger?.isConnected) {
      trigger.focus();
    } else {
      this.focusContainer();
    }
  }

  onDeleteEscape(event: Event): void {
    this.cancelDelete(event);
  }

  async confirmDelete(id: string): Promise<void> {
    if (this.deletingId() !== null || this.confirmingDeleteId() !== id) return;
    // El id debe ser un mensaje cargado en esta conversación: nunca scopeId
    // (id del hilo o de la lección), que borraría el hilo entero por error.
    const target = this.posts().find((post) => post.id === id);
    if (!target) return;
    const repository = this.repository();
    if (typeof repository.deleteComment !== 'function') {
      this.failedDeleteId.set(id);
      this.deleteError.set(this.deleteFailureText());
      return;
    }
    const request = this.request;
    const nextId = this.nextVisibleId(id);
    this.deletingId.set(id);
    this.deleteError.set('');
    this.failedDeleteId.set(null);
    try {
      const result = await repository.deleteComment(id);
      if (this.destroyed || request !== this.request) return;
      // Se respeta `thread_deleted` del servidor, pero una respuesta jamás
      // puede activar el estado de hilo eliminado aunque el flag viniera mal.
      const threadDeleted = result?.threadDeleted === true && target.parentId === null;
      this.posts.update((rows) => {
        const removed = this.descendantIds(rows, id);
        return rows.filter((row) => !removed.has(row.id));
      });
      this.confirmingDeleteId.set(null);
      this.failedDeleteId.set(null);
      this.deleteTriggerButton = null;
      this.deleteNotice.set(threadDeleted ? this.threadDeletedText() : this.commentDeletedText());
      if (threadDeleted) this.threadDeleted.emit(this.scopeId());
      this.focusAfterDelete(nextId);
    } catch {
      if (this.destroyed || request !== this.request) return;
      // Error saneado: nunca se muestra el mensaje crudo de la RPC.
      this.failedDeleteId.set(id);
      this.deleteError.set(this.deleteFailureText());
    } finally {
      if (!this.destroyed && request === this.request) this.deletingId.set(null);
    }
  }

  retryDelete(): void {
    const id = this.failedDeleteId();
    if (!id || this.deletingId() !== null) return;
    this.confirmingDeleteId.set(id);
    void this.confirmDelete(id);
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => {
      if (this.destroyed) return;
      this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    }, { injector: this.injector });
  }

  private focusContainer(): void {
    afterNextRender(() => {
      if (this.destroyed) return;
      this.host.nativeElement.querySelector<HTMLElement>('[data-conversation-list]')?.focus();
    }, { injector: this.injector });
  }

  private focusAfterDelete(nextId: string | null): void {
    afterNextRender(() => {
      if (this.destroyed) return;
      const host = this.host.nativeElement;
      const target = nextId
        ? host.querySelector<HTMLElement>(`[data-comment-id="${nextId}"]`)
        : host.querySelector<HTMLElement>('[data-conversation-list]');
      target?.focus();
    }, { injector: this.injector });
  }

  /** Ids en orden de lectura (raíz, luego sus descendientes, y así sucesivamente). */
  private flattenedIds(): string[] {
    const ids: string[] = [];
    const visit = (nodes: readonly ConversationNode[]): void => {
      for (const node of nodes) {
        ids.push(node.post.id);
        visit(node.children);
      }
    };
    visit(this.tree());
    return ids;
  }

  /** Subárbol local: protege contra ciclos y no toca ninguna otra rama. */
  private descendantIds(rows: readonly ConversationPost[], id: string): Set<string> {
    const byParent = new Map<string | null, string[]>();
    for (const row of rows) {
      const siblings = byParent.get(row.parentId) ?? [];
      siblings.push(row.id);
      byParent.set(row.parentId, siblings);
    }
    const found = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (found.has(current)) continue;
      found.add(current);
      for (const child of byParent.get(current) ?? []) stack.push(child);
    }
    return found;
  }

  /** Siguiente mensaje que sobrevivirá al borrado, para no perder el foco. */
  private nextVisibleId(id: string): string | null {
    const order = this.flattenedIds();
    const index = order.indexOf(id);
    if (index < 0) return null;
    const removed = this.descendantIds(this.posts(), id);
    for (let i = index + 1; i < order.length; i++) {
      if (!removed.has(order[i])) return order[i];
    }
    return null;
  }
}
