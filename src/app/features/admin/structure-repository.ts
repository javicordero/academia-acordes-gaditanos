import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { LessonContentType } from '../../shared/lesson-content-type';

export interface Section {
  id: string; course_id: string; title: string; summary: string | null; position: number;
}
export interface Lesson {
  id: string; course_id: string; section_id: string; slug: string; title: string;
  summary: string | null; content_md: string | null; position: number;
  duration_seconds: number | null; is_free_preview: boolean; is_published: boolean; content_type: LessonContentType;
}
export type SectionValues = Pick<Section, 'title' | 'summary'>;
export type LessonValues = Pick<Lesson, 'title' | 'is_free_preview' | 'is_published' | 'content_type'>;

@Injectable({ providedIn: 'root' })
export class StructureRepository {
  private readonly client = inject(SUPABASE_CLIENT);

  async list(courseId: string): Promise<{ sections: Section[]; lessons: Lesson[] }> {
    if (!this.client) throw new Error('unavailable');
    const [sections, lessons] = await Promise.all([
      this.client.from('course_sections').select('id,course_id,title,summary,position').eq('course_id', courseId).order('position'),
      this.client.from('lessons').select('id,course_id,section_id,slug,title,summary,content_md,position,duration_seconds,is_free_preview,is_published,content_type').eq('course_id', courseId).order('position'),
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

  async saveLesson(courseId: string, sectionId: string, values: LessonValues, position: number, existing?: Lesson, slug?: string): Promise<void> {
    if (!this.client) throw new Error('unavailable');
    if (!existing && !slug) throw new Error('missing_slug');
    const query = existing
      ? this.client.from('lessons').update(values).eq('id', existing.id).eq('course_id', courseId).eq('section_id', sectionId)
      : this.client.from('lessons').insert({ ...values, slug, course_id: courseId, section_id: sectionId, position });
    const { data, error } = await query.select('id').single();
    if (error?.code === '23505') throw new Error('save_conflict');
    if (error || !data) throw new Error('save_failed');
  }

  /**
   * UID verificado por el servidor de Auth, no un valor del cuerpo ni de los
   * metadatos del cliente. La RPC vuelve a comprobarlo contra la sesión JWT y
   * contra public.user_roles; aquí nunca se usa una clave de service_role.
   */
  private async currentUserId(): Promise<string> {
    const client = this.client;
    if (!client) throw new Error('unavailable');
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('unauthenticated');
    return data.user.id;
  }

  private validateOrder(orderedIds: string[]): void {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0 ||
      orderedIds.some(id => !id) || new Set(orderedIds).size !== orderedIds.length) {
      throw new Error('invalid_order');
    }
  }

  private async invokeReorder(functionName: string, args: Record<string, unknown>): Promise<void> {
    const client = this.client;
    if (!client) throw new Error('unavailable');
    const { error } = await client.rpc(functionName, args);
    if (error?.code === '42501') throw new Error('forbidden');
    if (error) throw new Error('reorder_failed');
  }

  /** Pide la lista completa de bloques del curso en el orden deseado. */
  async reorderCourseSections(courseId: string, orderedIds: string[]): Promise<void> {
    const userId = await this.currentUserId();
    this.validateOrder(orderedIds);
    await this.invokeReorder('reorder_course_sections', {
      p_user_id: userId, p_course_id: courseId, p_ordered_ids: orderedIds,
    });
  }

  /** Pide la lista completa de lecciones del bloque en el orden deseado. */
  async reorderSectionLessons(sectionId: string, orderedIds: string[]): Promise<void> {
    const userId = await this.currentUserId();
    this.validateOrder(orderedIds);
    await this.invokeReorder('reorder_section_lessons', {
      p_user_id: userId, p_section_id: sectionId, p_ordered_ids: orderedIds,
    });
  }
}
