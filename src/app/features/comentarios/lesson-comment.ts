/**
 * Modelo público de un comentario de una lección.
 *
 * El servidor (RPC/RLS) es la única autoridad: el cliente solo representa lo que
 * devuelve. Aquí no hay correos, identificadores de autor ni datos privados.
 */
export interface LessonComment {
  readonly id: string;
  readonly parentId: string | null;
  readonly body: string;
  readonly createdAt: string;
  readonly authorDisplayName: string;
  readonly authorIsAdmin: boolean;
}

/** Límite del cuerpo del mensaje, compartido por formulario y repositorio. */
export const MAX_COMMENT_LENGTH = 2000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Errores propios, sin mensajes crudos del servidor ni detalles de la RPC. */
export type CommentsFailure = 'unconfigured' | 'forbidden' | 'invalid' | 'failed';

export class LessonCommentsError extends Error {
  constructor(readonly kind: CommentsFailure) {
    super(kind);
    this.name = 'LessonCommentsError';
  }
}

/**
 * Un rechazo por permisos (o sin cliente configurado) no debe revelar si la
 * lección tiene comentarios: la interfaz oculta por completo la sección.
 */
export function shouldHideComments(error: unknown): boolean {
  return error instanceof LessonCommentsError &&
    (error.kind === 'forbidden' || error.kind === 'unconfigured');
}
