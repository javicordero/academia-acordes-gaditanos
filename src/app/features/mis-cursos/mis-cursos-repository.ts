import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

interface Course { id: string; slug: string; title: string; summary: string | null; level: 'iniciacion' | 'basico' | 'intermedio' }
interface Section { id: string; position: number }
interface Lesson { id: string; slug: string; section_id: string; position: number }
interface Progress { lesson_id: string; completed_at: string | null; last_activity_at: string }
export interface LibraryCourse extends Course { total: number; completed: number; percent: number; resume: string | null }
export interface Library { courses: LibraryCourse[]; unavailable: number }

@Injectable({ providedIn: 'root' })
export class MisCursosRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  async load(userId: string): Promise<Library> {
    if (!this.client) throw new Error('unconfigured');
    const rights = await this.client.from('entitlements').select('course_id')
      .eq('user_id', userId).is('revoked_at', null).returns<{course_id: string}[]>();
    if (rights.error) throw new Error('load');
    const ids = [...new Set((rights.data ?? []).map(right => right.course_id))];
    if (!ids.length) return { courses: [], unavailable: 0 };
    const result = await this.client.from('courses').select('id,slug,title,summary,level')
      .in('id', ids).eq('status', 'published').order('sort_order').returns<Course[]>();
    if (result.error) throw new Error('load');
    const courses = result.data ?? [];
    const library = await Promise.all(courses.map(async course => {
      const [sections, lessons] = await Promise.all([
        this.client!.from('course_sections').select('id,position').eq('course_id', course.id).order('position').returns<Section[]>(),
        this.client!.from('lessons').select('id,slug,section_id,position').eq('course_id', course.id).eq('is_published', true).order('position').returns<Lesson[]>(),
      ]);
      if (sections.error || lessons.error) throw new Error('load');
      const sectionOrder = new Map((sections.data ?? []).map((section, index) => [section.id, index]));
      const ordered = (lessons.data ?? []).filter(lesson => sectionOrder.has(lesson.section_id))
        .sort((a, b) => sectionOrder.get(a.section_id)! - sectionOrder.get(b.section_id)! || a.position - b.position);
      let progress: Progress[] = [];
      if (ordered.length) {
        const rows = await this.client!.from('lesson_progress').select('lesson_id,completed_at,last_activity_at')
          .eq('user_id', userId).in('lesson_id', ordered.map(lesson => lesson.id)).returns<Progress[]>();
        if (rows.error) throw new Error('load');
        progress = rows.data ?? [];
      }
      const byLesson = new Map(progress.map(row => [row.lesson_id, row]));
      const completed = ordered.filter(lesson => !!byLesson.get(lesson.id)?.completed_at).length;
      const recent = ordered.filter(lesson => byLesson.has(lesson.id)).sort((a, b) =>
        (byLesson.get(b.id)?.last_activity_at ?? '').localeCompare(byLesson.get(a.id)?.last_activity_at ?? ''))[0];
      const resume = recent ?? ordered.find(lesson => !byLesson.get(lesson.id)?.completed_at) ?? null;
      return { ...course, total: ordered.length, completed, percent: ordered.length ? Math.round(completed * 100 / ordered.length) : 0, resume: resume?.slug ?? null };
    }));
    return { courses: library, unavailable: ids.length - courses.length };
  }
}
