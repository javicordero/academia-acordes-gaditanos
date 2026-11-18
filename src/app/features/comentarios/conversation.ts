/**
 * Modelo y puerto compartidos por las dudas de lección y el foro.
 *
 * Una sola conversación: la vista recursiva y la validación de filas son las
 * mismas en los dos sitios. Cambia únicamente el repositorio inyectado. El
 * servidor (RPC/RLS) sigue siendo la única autoridad; aquí no hay correos,
 * identificadores de autor ni secretos.
 */
export interface ConversationPost {
  readonly id: string;
  readonly parentId: string | null;
  readonly body: string;
  readonly createdAt: string;
  readonly authorDisplayName: string;
  readonly authorIsAdmin: boolean;
}

/**
 * Resultado permitido de una moderación. `threadDeleted` solo lo pone en true
 * la RPC del foro cuando se borra el mensaje raíz; la de lección siempre false.
 * No viaja ningún otro dato del servidor (ni IDs de proveedor ni correos).
 */
export interface DeleteCommentResult {
  readonly threadDeleted: boolean;
}

/**
 * Puerto de la vista. `scopeId` identifica la conversación (lección o tema) y
 * `create` admite una respuesta opcional a cualquier mensaje del árbol.
 * `deleteComment` es la única operación de moderación: la autoridad sigue siendo
 * la RPC (RLS); esta interfaz solo transporta el permiso que el servidor aplica.
 */
export interface ConversationRepository {
  list(scopeId: string): Promise<readonly ConversationPost[]>;
  create(scopeId: string, body: string, parentId?: string | null): Promise<ConversationPost>;
  deleteComment(id: string): Promise<DeleteCommentResult>;
}

/** Límite del cuerpo del mensaje, compartido por formulario y repositorios. */
export const MAX_CONVERSATION_LENGTH = 2000;
export const MAX_AUTHOR_NAME_LENGTH = 200;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isConversationUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export type ConversationFailure = 'unconfigured' | 'forbidden' | 'invalid' | 'failed';

/** Errores propios, sin mensajes crudos del servidor ni detalles de la RPC. */
export class ConversationError extends Error {
  constructor(readonly kind: ConversationFailure) {
    super(kind);
    this.name = 'ConversationError';
  }
}

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

function readString(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || !(key in value)) return '';
  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : '';
}

/** Traduce el error sin filtrar su mensaje, código ni datos personales. */
export function classifyConversationError(error: unknown): ConversationError {
  const code = readString(error, 'code').toUpperCase();
  const message = readString(error, 'message').toLowerCase();
  if (DENIED_CODES.has(code) || DENIED_TEXT.some((part) => message.includes(part))) {
    return new ConversationError('forbidden');
  }
  return new ConversationError('failed');
}

/**
 * Valida cada fila antes de dejarla entrar en la interfaz. Un cambio de forma
 * en la respuesta nunca debe convertirse en HTML, una URL ni un dato personal.
 */
export function parseConversationRow(value: unknown): ConversationPost {
  if (typeof value !== 'object' || value === null) throw new ConversationError('invalid');
  const row = value as Record<string, unknown>;
  const { id, parent_id, body, created_at, author_display_name, author_is_admin } = row;

  if (!isConversationUuid(id)) throw new ConversationError('invalid');
  if (parent_id !== null && !isConversationUuid(parent_id)) throw new ConversationError('invalid');
  if (typeof body !== 'string' || !body.trim() || body.length > MAX_CONVERSATION_LENGTH) {
    throw new ConversationError('invalid');
  }
  if (typeof created_at !== 'string' || !Number.isFinite(Date.parse(created_at))) {
    throw new ConversationError('invalid');
  }
  if (
    typeof author_display_name !== 'string' ||
    !author_display_name.trim() ||
    author_display_name.length > MAX_AUTHOR_NAME_LENGTH
  ) {
    throw new ConversationError('invalid');
  }
  if (typeof author_is_admin !== 'boolean') throw new ConversationError('invalid');

  return {
    id,
    parentId: parent_id,
    body,
    createdAt: created_at,
    authorDisplayName: author_display_name,
    authorIsAdmin: author_is_admin,
  };
}

/**
 * Un rechazo por permisos (o sin cliente configurado) oculta la conversación:
 * no debe revelar si hay mensajes detrás. Se comprueba `kind` y no `instanceof`
 * para reconocer también el error histórico de comentarios de lección.
 */
export function shouldHideConversation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const kind = (error as { kind?: unknown }).kind;
  return kind === 'forbidden' || kind === 'unconfigured';
}
