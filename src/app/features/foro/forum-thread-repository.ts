import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import {
  ConversationError,
  ConversationPost,
  ConversationRepository,
  DeleteCommentResult,
  MAX_AUTHOR_NAME_LENGTH,
  MAX_CONVERSATION_LENGTH,
  classifyConversationError,
  isConversationUuid,
  parseConversationRow,
} from '../comentarios/conversation';

/** Categoría pública del foro, tal como la entrega `list_forum_categories()`. */
export interface ForumCategory {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly position: number;
}

/** Hilo del listado; `reply_count` lo calcula el servidor. */
export interface ForumThread {
  readonly id: string;
  readonly categoryId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly authorDisplayName: string;
  readonly authorIsAdmin: boolean;
  readonly replyCount: number;
}

/** Hilo recién creado: se usa para navegar a su conversación sin recargar. */
export interface ForumNewThread {
  readonly id: string;
  readonly categoryId: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly authorDisplayName: string;
  readonly authorIsAdmin: boolean;
}

export const MAX_THREAD_TITLE_LENGTH = 120;

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= MAX_AUTHOR_NAME_LENGTH;
}

function validTitle(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= MAX_THREAD_TITLE_LENGTH;
}

function validBody(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= MAX_CONVERSATION_LENGTH;
}

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function invalid(): never {
  throw new ConversationError('invalid');
}

function parseCategory(value: unknown): ForumCategory {
  if (typeof value !== 'object' || value === null) invalid();
  const row = value as Record<string, unknown>;
  const { id, slug, title, description, position } = row;
  if (!isConversationUuid(id)) invalid();
  if (typeof slug !== 'string' || !slug.trim() || slug.length > 200) invalid();
  if (!validTitle(title)) invalid();
  if (typeof description !== 'string' || description.length > MAX_CONVERSATION_LENGTH) invalid();
  if (!validCount(position)) invalid();
  return { id, slug, title, description, position };
}

function parseThread(value: unknown): ForumThread {
  if (typeof value !== 'object' || value === null) invalid();
  const row = value as Record<string, unknown>;
  const { id, category_id, title, created_at, author_display_name, author_is_admin, reply_count } = row;
  if (!isConversationUuid(id) || !isConversationUuid(category_id)) invalid();
  if (!validTitle(title) || !validDate(created_at) || !validName(author_display_name)) invalid();
  if (typeof author_is_admin !== 'boolean' || !validCount(reply_count)) invalid();
  return {
    id,
    categoryId: category_id,
    title,
    createdAt: created_at,
    authorDisplayName: author_display_name,
    authorIsAdmin: author_is_admin,
    replyCount: reply_count,
  };
}

function parseNewThread(value: unknown): ForumNewThread {
  if (typeof value !== 'object' || value === null) invalid();
  const row = value as Record<string, unknown>;
  const { id, category_id, title, body, created_at, author_display_name, author_is_admin } = row;
  if (!isConversationUuid(id) || !isConversationUuid(category_id)) invalid();
  if (!validTitle(title) || !validBody(body) || !validDate(created_at) || !validName(author_display_name)) invalid();
  if (typeof author_is_admin !== 'boolean') invalid();
  return {
    id,
    categoryId: category_id,
    title,
    body,
    createdAt: created_at,
    authorDisplayName: author_display_name,
    authorIsAdmin: author_is_admin,
  };
}

/** PostgREST entrega conjuntos incluso para una sola fila. */
function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Adaptador del foro al puerto `ConversationRepository`: el tema es el ámbito
 * de la conversación y las RPC son las mismas que para cualquier mensaje.
 * Nunca expone el error crudo ni envía claves o datos de autor.
 */
@Injectable({ providedIn: 'root' })
export class ForumThreadRepository implements ConversationRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  async listCategories(): Promise<readonly ForumCategory[]> {
    const data = await this.rpc('list_forum_categories', {});
    if (!Array.isArray(data)) throw new ConversationError('invalid');
    return data.map(parseCategory);
  }

  async listThreads(categoryId: string): Promise<readonly ForumThread[]> {
    if (!isConversationUuid(categoryId)) throw new ConversationError('invalid');
    const data = await this.rpc('list_forum_threads', { p_category_id: categoryId });
    if (!Array.isArray(data)) throw new ConversationError('invalid');
    return data.map(parseThread);
  }

  async createThread(categoryId: string, title: string, body: string): Promise<ForumNewThread> {
    if (!isConversationUuid(categoryId) || !validTitle(title) || !validBody(body)) {
      throw new ConversationError('invalid');
    }
    const data = await this.rpc('create_forum_thread', {
      p_category_id: categoryId,
      p_title: title.trim(),
      p_body: body.trim(),
    });
    return parseNewThread(firstRow(data));
  }

  /** Mensajes de un tema, con la misma forma que las dudas de lección. */
  async list(scopeId: string): Promise<readonly ConversationPost[]> {
    if (!isConversationUuid(scopeId)) throw new ConversationError('invalid');
    const data = await this.rpc('list_thread_posts', { p_thread_id: scopeId });
    if (!Array.isArray(data)) throw new ConversationError('invalid');
    return data.map(parseConversationRow);
  }

  async create(
    scopeId: string,
    body: string,
    parentId: string | null = null,
  ): Promise<ConversationPost> {
    if (
      !isConversationUuid(scopeId) ||
      !validBody(body) ||
      (parentId !== null && !isConversationUuid(parentId))
    ) {
      throw new ConversationError('invalid');
    }
    const data = await this.rpc('create_thread_post', {
      p_thread_id: scopeId,
      p_body: body.trim(),
      p_parent_id: parentId,
    });
    return parseConversationRow(firstRow(data));
  }

  /**
   * Moderación de un mensaje del foro. La RPC devuelve un jsonb con
   * `{ deleted, thread_deleted, deleted_posts }`: se valida cada campo y solo
   * se conserva `thread_deleted` para el aviso de la interfaz. Los identificadores
   * borrados no se exponen; cualquier forma inesperada es un error `invalid`.
   */
  async deleteComment(id: string): Promise<DeleteCommentResult> {
    if (!isConversationUuid(id)) throw new ConversationError('invalid');
    const data = await this.rpc('delete_forum_post', { p_post_id: id });
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new ConversationError('invalid');
    }
    const row = data as Record<string, unknown>;
    if (row['deleted'] !== true) throw new ConversationError('invalid');
    if (typeof row['thread_deleted'] !== 'boolean') throw new ConversationError('invalid');
    if (
      !Array.isArray(row['deleted_posts']) ||
      !row['deleted_posts'].every((item) => isConversationUuid(item))
    ) {
      throw new ConversationError('invalid');
    }
    return { threadDeleted: row['thread_deleted'] };
  }

  /** Una sola puerta a la RPC: sin cliente no se intenta ninguna llamada. */
  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new ConversationError('unconfigured');
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw classifyConversationError(error);
    return data;
  }
}

/** Texto del error solo cuando es propio: nunca `error.message` del servidor. */
export function forumFailureMessage(error: unknown): string {
  if (error instanceof ConversationError && error.kind === 'forbidden') {
    return 'No tienes permiso para publicar en el foro.';
  }
  return 'No se pudo completar la acción. Inténtalo de nuevo.';
}
