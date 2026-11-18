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
export interface PublicLesson { id: string; section_id: string; slug: string; title: string; is_free_preview: boolean; }
export interface CourseDetail { course: PublicCourse; sections: PublicSection[]; lessons: PublicLesson[]; }

/**
 * Acceso del usuario actual a un curso concreto.
 *
 * - `granted`: tiene un derecho con `revoked_at` nulo. Solo entonces puede
 *   mostrarse «Ya tienes acceso».
 * - `revoked`: solo tiene derechos revocados; se informa sin prometer compra.
 * - `none`: no tiene derechos sobre el curso.
 *
 * El rol admin no produce `granted`: la vista previa no es una compra. El
 * cliente solo lee sus propias filas (RLS); la autorización real va en servidor.
 */
export type CourseAccess = 'granted' | 'revoked' | 'none';

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
      this.client.from('lessons').select('id,section_id,slug,title,is_free_preview')
        .eq('course_id', course.id).eq('is_published', true).order('position').returns<PublicLesson[]>(),
    ]);
    if (sections.error || lessons.error) throw new Error('failed');
    return { course, sections: sections.data ?? [], lessons: lessons.data ?? [] };
  }

  /**
   * Derecho real del usuario indicado sobre el curso, reutilizando la tabla
   * `entitlements` ya modelada y protegida por RLS. Nunca se consulta el rol.
   * Lanza `failed` si la consulta no se puede completar.
   */
  async access(courseId: string, userId: string): Promise<CourseAccess> {
    if (!this.client) throw new Error('unavailable');
    const { data, error } = await this.client.from('entitlements').select('revoked_at')
      .eq('user_id', userId).eq('course_id', courseId).returns<{ revoked_at: string | null }[]>();
    if (error) throw new Error('failed');
    const rows = data ?? [];
    if (rows.some((row) => row.revoked_at === null)) return 'granted';
    return rows.length ? 'revoked' : 'none';
  }
}
