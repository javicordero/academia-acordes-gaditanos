import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import { Lesson, Section } from '../structure-repository';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: 'root' })
export class PreviewRepository {
  private readonly auth = inject(AuthService);
  private readonly client = inject(SUPABASE_CLIENT);

  async load(courseId: string, lessonId: string | null) {
    if (!uuid.test(courseId) || (lessonId !== null && !uuid.test(lessonId))) return null;
    await this.auth.whenInitialized();
    await this.auth.whenRoleResolved();
    const userId = this.auth.session()?.user.id;
    if (!userId || !this.auth.isAdmin() || !this.client) return null;
    const [course, sections, lessons] = await Promise.all([
      this.client.from('courses').select('id,title').eq('id', courseId).maybeSingle(),
      this.client.from('course_sections').select('id,course_id,title,summary,position').eq('course_id', courseId).order('position'),
      this.client.from('lessons').select('id,course_id,section_id,slug,title,summary,content_md,position,duration_seconds,is_free_preview,is_published,content_type').eq('course_id', courseId).order('position'),
    ]);
    if (this.auth.session()?.user.id !== userId || !this.auth.isAdmin()) return null;
    if (course.error || sections.error || lessons.error) throw new Error('preview_failed');
    if (!course.data) return null;
    const sectionList = (sections.data ?? []) as Section[];
    const lessonList = (lessons.data ?? []) as Lesson[];
    const ordered = sectionList.flatMap(s => lessonList.filter(l => l.course_id === courseId && l.section_id === s.id));
    const lesson = lessonId ? ordered.find(l => l.id === lessonId) : ordered[0];
    return { course: course.data, sections: sectionList, lessons: ordered, lesson: lesson ?? null };
  }
}
