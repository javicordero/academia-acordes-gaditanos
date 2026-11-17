import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

export interface Section {
  id: string; course_id: string; title: string; summary: string | null; position: number;
}
export interface Lesson {
  id: string; course_id: string; section_id: string; slug: string; title: string;
  summary: string | null; content_md: string | null; position: number;
  duration_seconds: number | null; is_free_preview: boolean; is_published: boolean;
}
export type SectionValues = Pick<Section, 'title' | 'summary'>;
export type LessonValues = Pick<Lesson, 'slug' | 'title' | 'summary' | 'content_md' | 'duration_seconds' | 'is_free_preview' | 'is_published'>;

@Injectable({ providedIn: 'root' })
export class StructureRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  async list(courseId: string): Promise<{ sections: Section[]; lessons: Lesson[] }> {
    if (!this.client) throw new Error('unavailable');
    const [sections, lessons] = await Promise.all([
      this.client.from('course_sections').select('id,course_id,title,summary,position').eq('course_id', courseId).order('position'),
      this.client.from('lessons').select('id,course_id,section_id,slug,title,summary,content_md,position,duration_seconds,is_free_preview,is_published').eq('course_id', courseId).order('position'),
    ]);
    if (sections.error || lessons.error) throw new Error('list_failed');
    return { sections: sections.data as Section[] ?? [], lessons: lessons.data as Lesson[] ?? [] };
  }

  async saveSection(courseId: string, values: SectionValues, position: number, existing?: Section): Promise<void> {
    if (!this.client) throw new Error('unavailable');
    const query = existing
      ? this.client.from('course_sections').update(values).eq('id', existing.id).eq('course_id', courseId)
      : this.client.from('course_sections').insert({ ...values, course_id: courseId, position });
    const { data, error } = await query.select('id').single();
    if (error || !data) throw new Error('save_failed');
  }

  async saveLesson(courseId: string, sectionId: string, values: LessonValues, position: number, existing?: Lesson): Promise<void> {
    if (!this.client) throw new Error('unavailable');
    const query = existing
      ? this.client.from('lessons').update(values).eq('id', existing.id).eq('course_id', courseId).eq('section_id', sectionId)
      : this.client.from('lessons').insert({ ...values, course_id: courseId, section_id: sectionId, position });
    const { data, error } = await query.select('id').single();
    if (error || !data) throw new Error('save_failed');
  }
}
