import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

export type CourseLevel = 'iniciacion' | 'basico' | 'intermedio';
export type CourseStatus = 'draft' | 'published' | 'archived';
export interface CourseValues {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  level: CourseLevel;
  status: CourseStatus;
  sort_order: number;
  published_at: string | null;
}
export interface Course extends CourseValues { id: string; }

@Injectable({ providedIn: 'root' })
export class CoursesRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly columns = 'id,slug,title,summary,description,level,status,sort_order,published_at';

  async list(): Promise<Course[]> {
    if (!this.client) throw new Error('unavailable');
    const { data, error } = await this.client.from('courses').select(this.columns)
      .order('sort_order').order('title').returns<Course[]>();
    if (error) throw new Error('list_failed');
    return data ?? [];
  }

  async save(values: CourseValues, existing?: Course): Promise<Course> {
    if (!this.client) throw new Error('unavailable');
    const payload = {
      ...values,
      published_at: existing?.published_at ?? values.published_at ??
        (values.status === 'published' ? new Date().toISOString() : null),
    };
    const query = existing
      ? this.client.from('courses').update(payload).eq('id', existing.id)
      : this.client.from('courses').insert(payload);
    const { data, error } = await query.select(this.columns).single();
    if (error || !data) throw new Error('save_failed');
    return data as Course;
  }
}
