/**
 * Modelo público de una lección guardada como favorita.
 *
 * El servidor (RPC/RLS) es la única autoridad. Aquí solo se representa lo que
 * devuelve: ni correos, ni datos de cuenta, ni secretos de proveedor.
 */
export interface LessonFavorite {
  readonly lessonId: string;
  readonly lessonSlug: string;
  readonly lessonTitle: string;
  readonly courseId: string;
  readonly courseSlug: string;
  readonly courseTitle: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly position: number;
  readonly createdAt: string;
}

/** Agrupación derivada, lista para pintar sin trabajo caro en la plantilla. */
export interface FavoriteGroup {
  readonly courseId: string;
  readonly courseSlug: string;
  readonly courseTitle: string;
  readonly lessons: readonly LessonFavorite[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 300;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT_LENGTH;
}

/**
 * Respeta el orden de aparición de los cursos y ordena las lecciones por su
 * posición editorial. Nunca modifica las filas originales.
 */
export function groupFavorites(rows: readonly LessonFavorite[]): readonly FavoriteGroup[] {
  const groups = new Map<string, {
    courseId: string;
    courseSlug: string;
    courseTitle: string;
    lessons: LessonFavorite[];
  }>();

  for (const row of rows) {
    let group = groups.get(row.courseId);
    if (!group) {
      group = {
        courseId: row.courseId,
        courseSlug: row.courseSlug,
        courseTitle: row.courseTitle,
        lessons: [],
      };
      groups.set(row.courseId, group);
    }
    group.lessons.push(row);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    lessons: [...group.lessons].sort(
      (a, b) => a.position - b.position ||
        a.lessonTitle.localeCompare(b.lessonTitle, 'es'),
    ),
  }));
}

/** Errores propios: el mensaje crudo de la RPC nunca llega a la interfaz. */
export type FavoritesFailure = 'unconfigured' | 'forbidden' | 'invalid' | 'failed';

export class LessonFavoritesError extends Error {
  constructor(readonly kind: FavoritesFailure) {
    super(kind);
    this.name = 'LessonFavoritesError';
  }
}
