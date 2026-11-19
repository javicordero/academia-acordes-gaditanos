import { Injectable, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import {
  LessonFavorite,
  LessonFavoritesError,
  isText,
  isUuid,
} from './lesson-favorite';

/** Códigos y fragmentos de rechazo: solo sirven para clasificar, nunca se muestran. */
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

function classify(error: unknown): LessonFavoritesError {
  const code = readString(error, 'code').toUpperCase();
  const message = readString(error, 'message').toLowerCase();
  if (DENIED_CODES.has(code) || DENIED_TEXT.some((part) => message.includes(part))) {
    return new LessonFavoritesError('forbidden');
  }
  return new LessonFavoritesError('failed');
}

/** Valida cada fila antes de dejarla entrar en la interfaz. */
function parseRow(value: unknown): LessonFavorite {
  if (typeof value !== 'object' || value === null) {
    throw new LessonFavoritesError('invalid');
  }
  const row = value as Record<string, unknown>;
  const {
    lesson_id, lesson_slug, lesson_title,
    course_id, course_slug, course_title,
    section_id, section_title, position, created_at,
  } = row;

  if (!isUuid(lesson_id) || !isUuid(course_id) || !isUuid(section_id)) {
    throw new LessonFavoritesError('invalid');
  }
  if (
    !isText(lesson_slug) || !isText(lesson_title) ||
    !isText(course_slug) || !isText(course_title) || !isText(section_title)
  ) {
    throw new LessonFavoritesError('invalid');
  }
  if (!Number.isInteger(position) || (position as number) < 0) {
    throw new LessonFavoritesError('invalid');
  }
  if (typeof created_at !== 'string' || !Number.isFinite(Date.parse(created_at))) {
    throw new LessonFavoritesError('invalid');
  }

  return {
    lessonId: lesson_id,
    lessonSlug: lesson_slug,
    lessonTitle: lesson_title,
    courseId: course_id,
    courseSlug: course_slug,
    courseTitle: course_title,
    sectionId: section_id,
    sectionTitle: section_title,
    position: position as number,
    createdAt: created_at,
  };
}

@Injectable({ providedIn: 'root' })
export class LessonFavoritesRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  /** Lista de favoritos del usuario de la sesión; la identidad la resuelve RLS. */
  async list(): Promise<readonly LessonFavorite[]> {
    if (!this.client) throw new LessonFavoritesError('unconfigured');
    const { data, error } = await this.client.rpc('list_my_lesson_favorites');
    if (error) throw classify(error);
    if (!Array.isArray(data)) throw new LessonFavoritesError('invalid');
    return data.map(parseRow);
  }

  /**
   * Alterna un favorito y devuelve el estado resultante según el servidor:
   * `true` ahora guardado, `false` ahora eliminado. El permiso real se comprueba
   * en base de datos; aquí solo se valida y sanea la respuesta.
   */
  async toggle(lessonId: string): Promise<boolean> {
    if (!this.client) throw new LessonFavoritesError('unconfigured');
    if (!isUuid(lessonId)) throw new LessonFavoritesError('invalid');
    const { data, error } = await this.client.rpc('toggle_lesson_favorite', {
      p_lesson_id: lessonId,
    });
    if (error) throw classify(error);
    if (typeof data !== 'boolean') throw new LessonFavoritesError('invalid');
    return data;
  }
}
