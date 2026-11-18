import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

interface Course {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: 'iniciacion' | 'basico' | 'intermedio';
}
interface Section {
  id: string;
  position: number;
}
interface Lesson {
  id: string;
  slug: string;
  section_id: string;
  position: number;
}
interface Progress {
  lesson_id: string;
  completed_at: string | null;
  last_activity_at: string;
}

export interface LibraryCourse extends Course {
  total: number;
  completed: number;
  percent: number;
  resume: string | null;
}

/** Curso con derecho que no se puede mostrar. */
export type LibraryProblem =
  | { readonly courseId: string; readonly kind: 'unavailable' }
  | { readonly courseId: string; readonly kind: 'failed' };

export interface Library {
  readonly courses: LibraryCourse[];
  /** Número de problemas `unavailable`; coherente con `problems`. */
  readonly unavailable: number;
  readonly problems: LibraryProblem[];
}

/** Reintento: cursos ya en pantalla y problemas pendientes. */
export interface LibraryRetry {
  readonly courses: readonly LibraryCourse[];
  readonly problems: readonly LibraryProblem[];
}

@Injectable({ providedIn: 'root' })
export class MisCursosRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  /**
   * Carga la biblioteca del usuario indicado. Derechos y listado de cursos son
   * globales: si fallan, la biblioteca entera es un error honesto. El detalle
   * se carga por curso, de modo que un fallo puntual no oculta los válidos.
   *
   * `retry` pide solo los cursos antes fallidos y fusiona por ID, sin duplicados
   * y conservando el orden previo. Nunca consulta otra identidad: el componente
   * descarta las respuestas tardías de una sesión anterior.
   */
  async load(userId: string, retry?: LibraryRetry): Promise<Library> {
    if (!this.client) throw new Error('unconfigured');

    const retriedIds = retry
      ? retry.problems.filter((problem) => problem.kind === 'failed').map((problem) => problem.courseId)
      : [];
    const kept = retry ? [...retry.courses] : [];
    const keptIds = new Set(kept.map((course) => course.id));
    // Un curso inaccesible no se reintenta: sigue siendo inaccesible.
    const carried: LibraryProblem[] = retry
      ? retry.problems.filter((problem) => problem.kind === 'unavailable' && !keptIds.has(problem.courseId))
      : [];

    const courseIds = retry ? retriedIds : await this.entitledCourseIds(userId);
    if (!courseIds.length) {
      return { courses: kept, unavailable: carried.length, problems: carried };
    }

    const courses = await this.client
      .from('courses')
      .select('id,slug,title,summary,level')
      .in('id', courseIds)
      .eq('status', 'published')
      .order('sort_order')
      .returns<Course[]>();
    if (courses.error) throw new Error('load');

    // PostgREST ya filtra por `id` y `status`; el filtro local evita duplicados
    // si el resultado trae filas ya conservadas de un reintento anterior.
    const requested = new Set(courseIds);
    const published = (courses.data ?? []).filter((course) => requested.has(course.id) && !keptIds.has(course.id));
    const publishedIds = new Set(published.map((course) => course.id));

    const loaded = new Map<string, LibraryCourse>();
    const failures: LibraryProblem[] = [];
    for (const course of published) {
      try {
        loaded.set(course.id, await this.loadCourse(userId, course));
      } catch {
        failures.push({ courseId: course.id, kind: 'failed' });
      }
    }

    const unavailableIds = [
      ...new Set([
        ...carried.map((problem) => problem.courseId),
        ...courseIds.filter((id) => !publishedIds.has(id) && !keptIds.has(id)),
      ]),
    ];

    return {
      courses: kept.concat([...loaded.values()]),
      unavailable: unavailableIds.length,
      problems: [
        ...unavailableIds.map((courseId) => ({ courseId, kind: 'unavailable' as const })),
        ...failures,
      ],
    };
  }

  /** Solo derechos activos del usuario indicado; RLS protege la lectura. */
  private async entitledCourseIds(userId: string): Promise<string[]> {
    if (!this.client) throw new Error('unconfigured');
    const rights = await this.client
      .from('entitlements')
      .select('course_id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .returns<{ course_id: string }[]>();
    if (rights.error) throw new Error('load');
    return [...new Set((rights.data ?? []).map((right) => right.course_id))];
  }

  /** Detalle de un curso: un error aquí solo afecta a esa tarjeta. */
  private async loadCourse(userId: string, course: Course): Promise<LibraryCourse> {
    const client = this.client!;
    const sections = await client
      .from('course_sections')
      .select('id,position')
      .eq('course_id', course.id)
      .order('position')
      .returns<Section[]>();
    if (sections.error) throw new Error('load');

    const lessons = await client
      .from('lessons')
      .select('id,slug,section_id,position')
      .eq('course_id', course.id)
      .eq('is_published', true)
      .order('position')
      .returns<Lesson[]>();
    if (lessons.error) throw new Error('load');

    const sectionOrder = new Map((sections.data ?? []).map((section, index) => [section.id, index]));
    const ordered = (lessons.data ?? [])
      .filter((lesson) => sectionOrder.has(lesson.section_id))
      .sort((a, b) =>
        sectionOrder.get(a.section_id)! - sectionOrder.get(b.section_id)! || a.position - b.position);

    let progress: Progress[] = [];
    if (ordered.length) {
      const rows = await client
        .from('lesson_progress')
        .select('lesson_id,completed_at,last_activity_at')
        .eq('user_id', userId)
        .in('lesson_id', ordered.map((lesson) => lesson.id))
        .returns<Progress[]>();
      if (rows.error) throw new Error('load');
      progress = rows.data ?? [];
    }

    const byLesson = new Map(progress.map((row) => [row.lesson_id, row]));
    const completed = ordered.filter((lesson) => !!byLesson.get(lesson.id)?.completed_at).length;
    const recent = ordered
      .filter((lesson) => byLesson.has(lesson.id))
      .sort((a, b) => (byLesson.get(b.id)?.last_activity_at ?? '')
        .localeCompare(byLesson.get(a.id)?.last_activity_at ?? ''))[0];
    const resume = recent ?? ordered.find((lesson) => !byLesson.get(lesson.id)?.completed_at) ?? null;

    return {
      ...course,
      total: ordered.length,
      completed,
      percent: ordered.length ? Math.round(completed * 100 / ordered.length) : 0,
      resume: resume?.slug ?? null,
    };
  }
}
