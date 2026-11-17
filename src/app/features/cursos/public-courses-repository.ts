import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

export type PublicLevel = 'iniciacion' | 'basico' | 'intermedio';
export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  level: PublicLevel;
}
export interface PublicSection { id: string; title: string; summary: string | null; }
export interface PublicLesson { id: string; section_id: string; title: string; is_free_preview: boolean; }
export interface CourseDetail { course: PublicCourse; sections: PublicSection[]; lessons: PublicLesson[]; }

export const levelLabels: Record<PublicLevel, string> = {
  iniciacion: 'Iniciación', basico: 'Básico', intermedio: 'Intermedio',
};

@Injectable({ providedIn: 'root' })
export class PublicCoursesRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly columns = 'id,slug,title,summary,description,level';

  async list(): Promise<PublicCourse[]> {
    if (!this.client) throw new Error('unavailable');
    const { data, error } = await this.client.from('courses').select(this.columns)
      .eq('status', 'published').order('sort_order').order('title').returns<PublicCourse[]>();
    if (error) throw new Error('failed');
    return data ?? [];
  }

  async detail(slug: string): Promise<CourseDetail | null> {
    if (!this.client) throw new Error('unavailable');
    const { data: course, error } = await this.client.from('courses').select(this.columns)
      .eq('status', 'published').eq('slug', slug).maybeSingle<PublicCourse>();
    if (error) throw new Error('failed');
    if (!course) return null;
    const [sections, lessons] = await Promise.all([
      this.client.from('course_sections').select('id,title,summary')
        .eq('course_id', course.id).order('position').returns<PublicSection[]>(),
      this.client.from('lessons').select('id,section_id,title,is_free_preview')
        .eq('course_id', course.id).eq('is_published', true).order('position').returns<PublicLesson[]>(),
    ]);
    if (sections.error || lessons.error) throw new Error('failed');
    return { course, sections: sections.data ?? [], lessons: lessons.data ?? [] };
  }
}
