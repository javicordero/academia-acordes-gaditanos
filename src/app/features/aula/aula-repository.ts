import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { LessonContentType } from '../../shared/lesson-content-type';

export interface AulaLesson {
  /** Solo columnas que el aula necesita: resumen y contenido son de uso interno. */
  id: string; section_id: string; slug: string; title: string;
  content_type: LessonContentType;
  /** Opcional: la consulta pública actual no lo expone; se muestra sólo si existe. */
  duration_seconds?: number | null;
}
export interface AulaSection { id: string; title: string }
export interface AulaData {
  course: { id: string; title: string; teacher?: string | null };
  lesson: AulaLesson;
  sections: AulaSection[];
  lessons: AulaLesson[];
  canTrack: boolean;
  completed: boolean;
  /** Lecciones completadas por este alumno en el curso; solo con derecho activo. */
  completedLessonIds?: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class AulaRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  async load(courseSlug: string, lessonSlug: string, userId: string | null): Promise<AulaData | null> {
    if (!this.client) throw new Error('unconfigured');
    const courseResult = await this.client.from('courses').select('id,title')
      .eq('slug', courseSlug).eq('status', 'published').maybeSingle<{id: string; title: string}>();
    if (courseResult.error) throw new Error('load');
    const course = courseResult.data;
    if (!course) return null;
    const lessonResult = await this.client.from('lessons')
      .select('id,section_id,slug,title,content_type')
      .eq('course_id', course.id).eq('slug', lessonSlug).eq('is_published', true)
      .maybeSingle<AulaLesson>();
    if (lessonResult.error) throw new Error('load');
    const lesson = lessonResult.data;
    if (!lesson) return null;
    const [sections, lessons] = await Promise.all([
      this.client.from('course_sections').select('id,title').eq('course_id', course.id)
        .order('position').returns<AulaSection[]>(),
      this.client.from('lessons').select('id,section_id,slug,title,content_type')
        .eq('course_id', course.id).eq('is_published', true).order('position').returns<AulaLesson[]>(),
    ]);
    if (sections.error || lessons.error) throw new Error('load');
    let canTrack = false;
    let completed = false;
    let completedLessonIds: string[] = [];
    if (userId) {
      const entitlement = await this.client.from('entitlements').select('id')
        .eq('user_id', userId).eq('course_id', course.id).is('revoked_at', null).maybeSingle();
      if (entitlement.error) throw new Error('load');
      canTrack = !!entitlement.data;
      if (canTrack) {
        // Una sola consulta de progreso para todo el curso: el índice necesita
        // el estado real de cada lección, no solo el de la lección abierta.
        const lessonIds = [...new Set([lesson.id, ...(lessons.data ?? []).map(item => item.id)])];
        let progressRows: {lesson_id: string; completed_at: string | null}[] = [];
        if (lessonIds.length) {
          const progress = await this.client.from('lesson_progress')
            .select('lesson_id,completed_at')
            .eq('user_id', userId).in('lesson_id', lessonIds)
            .returns<{lesson_id: string; completed_at: string | null}[]>();
          if (progress.error) throw new Error('load');
          progressRows = progress.data ?? [];
        }
        completedLessonIds = progressRows.filter(row => !!row.completed_at).map(row => row.lesson_id);
        completed = completedLessonIds.includes(lesson.id);
      }
    }
    return {
      course, lesson, sections: sections.data ?? [], lessons: lessons.data ?? [],
      canTrack, completed, completedLessonIds,
    };
  }

  async save(userId: string, lessonId: string, completed: boolean): Promise<void> {
    if (!this.client) throw new Error('unconfigured');
    const now = new Date().toISOString();
    const { error } = await this.client.from('lesson_progress').upsert({
      user_id: userId, lesson_id: lessonId, completed_at: completed ? now : null,
      last_activity_at: now,
    }, { onConflict: 'user_id,lesson_id' });
    if (error) throw new Error('save');
  }
}
