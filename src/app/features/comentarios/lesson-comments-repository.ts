import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import {
  LessonComment,
  LessonCommentsError,
  MAX_COMMENT_LENGTH,
  isUuid,
} from './lesson-comment';

/** Códigos y fragmentos de rechazo de acceso: nunca se muestran al usuario. */
const DENIED_CODES = new Set(['42501', '28000', '401', '403', 'PGRST301', 'PGRST302']);
const DENIED_TEXT = [
  'permission denied',
  'insufficient_privilege',
  'row-level security',
  'forbidden',
  'unauthorized',
  'not authorized',
  'acceso denegado',
  'sin acceso',
];
const MAX_AUTHOR_NAME_LENGTH = 200;

function readString(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || !(key in value)) return '';
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : '';
}

function classify(error: unknown): LessonCommentsError {
  const code = readString(error, 'code').toUpperCase();
  const message = readString(error, 'message').toLowerCase();
  if (DENIED_CODES.has(code) || DENIED_TEXT.some((part) => message.includes(part))) {
    return new LessonCommentsError('forbidden');
  }
  return new LessonCommentsError('failed');
}

/**
 * Valida cada fila antes de dejarla entrar en la interfaz. Un cambio de forma
 * en la respuesta nunca debe convertirse en HTML, una URL ni un dato personal.
 */
function parseRow(value: unknown): LessonComment {
  if (typeof value !== 'object' || value === null) throw new LessonCommentsError('invalid');
  const row = value as Record<string, unknown>;
  const { id, parent_id, body, created_at, author_display_name, author_is_admin } = row;

  if (!isUuid(id)) throw new LessonCommentsError('invalid');
  if (parent_id !== null && !isUuid(parent_id)) throw new LessonCommentsError('invalid');
  if (typeof body !== 'string' || !body.trim() || body.length > MAX_COMMENT_LENGTH) {
    throw new LessonCommentsError('invalid');
  }
  if (typeof created_at !== 'string' || !Number.isFinite(Date.parse(created_at))) {
    throw new LessonCommentsError('invalid');
  }
  if (
    typeof author_display_name !== 'string' ||
    !author_display_name.trim() ||
    author_display_name.length > MAX_AUTHOR_NAME_LENGTH
  ) {
    throw new LessonCommentsError('invalid');
  }
  if (typeof author_is_admin !== 'boolean') throw new LessonCommentsError('invalid');

  return {
    id,
    parentId: parent_id,
    body,
    createdAt: created_at,
    authorDisplayName: author_display_name,
    authorIsAdmin: author_is_admin,
  };
}

@Injectable({ providedIn: 'root' })
export class LessonCommentsRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  /** Lectura de la conversación de una lección; la sesión la envía el SDK. */
  async list(lessonId: string): Promise<readonly LessonComment[]> {
    if (!this.client || typeof lessonId !== 'string' || !lessonId.trim()) {
      throw new LessonCommentsError('unconfigured');
    }
    const { data, error } = await this.client.rpc('list_lesson_comments', {
      p_lesson_id: lessonId,
    });
    if (error) throw classify(error);
    if (!Array.isArray(data)) throw new LessonCommentsError('invalid');
    return data.map(parseRow);
  }

  /**
   * Publica un comentario raíz o una respuesta a cualquier mensaje del hilo.
   * El cuerpo se recorta y valida antes de enviarlo; la fila devuelta se valida
   * igual que en `list`. No se envían claves ni identificadores de autor.
   */
  async create(lessonId: string, body: string, parentId: string | null): Promise<LessonComment> {
    if (!this.client) throw new LessonCommentsError('unconfigured');
    const trimmed = typeof body === 'string' ? body.trim() : '';
    if (
      typeof lessonId !== 'string' ||
      !lessonId.trim() ||
      (parentId !== null && !isUuid(parentId)) ||
      !trimmed ||
      trimmed.length > MAX_COMMENT_LENGTH
    ) {
      throw new LessonCommentsError('invalid');
    }

    const { data, error } = await this.client.rpc('create_lesson_comment', {
      p_lesson_id: lessonId,
      p_body: trimmed,
      p_parent_id: parentId,
    });
    if (error) throw classify(error);
    // La RPC está declarada `returns table(...)`, así que PostgREST entrega un
    // conjunto: incluso una sola fila llega como `[fila]`, no como objeto suelto.
    // `list` ya espera el array; `create` debe tomar su única fila antes de
    // validarla. Si venimos de un mock con objeto suelto, se acepta también.
    const created = Array.isArray(data) ? data[0] : data;
    return parseRow(created);
  }
}
