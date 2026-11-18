import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { Lesson, StructureRepository } from './structure-repository';

describe('StructureRepository', () => {
  const single = vi.fn();
  const order = vi.fn();
  const select = vi.fn();
  const eq = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const remove = vi.fn();
  const query = { select, eq, order, single, insert, update, delete: remove };
  const from = vi.fn(() => query);
  const rpc = vi.fn();
  const getUser = vi.fn();
  const values = { title: 'Lección', is_free_preview: false, is_published: false, content_type: 'pdf' as const };
  let repo: StructureRepository;
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue(query); eq.mockReturnValue(query); insert.mockReturnValue(query); update.mockReturnValue(query);
    order.mockResolvedValue({ data: [], error: null }); single.mockResolvedValue({ data: { id: 'id' }, error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'admin-uid' } }, error: null });
    rpc.mockResolvedValue({ error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from, rpc, auth: { getUser } } }] });
    repo = TestBed.inject(StructureRepository);
  });
  it('lista solo el curso ordenado y crea con claves compuestas y posición', async () => {
    expect(await repo.list('course')).toEqual({ sections: [], lessons: [] });
    expect(eq).toHaveBeenCalledWith('course_id', 'course');
    expect(order).toHaveBeenCalledWith('position');
    await repo.saveSection('course', { title: 'Bloque', summary: null }, 2);
    expect(insert).toHaveBeenCalledWith({ title: 'Bloque', summary: null, course_id: 'course', position: 2 });
    await repo.saveLesson('course', 'section', values, 3, undefined, 'leccion');
    expect(insert).toHaveBeenCalledWith({ ...values, slug: 'leccion', course_id: 'course', section_id: 'section', position: 3 });
    expect(remove).not.toHaveBeenCalled();
  });
  it('actualiza sin cambiar curso, bloque ni posición', async () => {
    const existing: Lesson = { ...values, slug: 'anterior', summary: ' resumen ', content_md: ' texto ', duration_seconds: 45,
      id: 'lesson', course_id: 'course', section_id: 'section', position: 3 };
    await repo.saveLesson('course', 'section', values, 9, existing);
    expect(update).toHaveBeenCalledWith(values);
    expect(eq).toHaveBeenCalledWith('id', 'lesson');
    expect(eq).toHaveBeenCalledWith('course_id', 'course');
    expect(eq).toHaveBeenCalledWith('section_id', 'section');
  });
  it('no expone errores de permisos ni acepta escrituras sin fila', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'private' } });
    await expect(repo.list('course')).rejects.toThrow('list_failed');
    single.mockResolvedValue({ data: null, error: { message: 'private' } });
    await expect(repo.saveLesson('course', 'section', values, 0, undefined, 'leccion')).rejects.toThrow('save_failed');
    single.mockResolvedValue({ data: null, error: { code: '23505' } });
    await expect(repo.saveLesson('course', 'section', values, 0, undefined, 'leccion')).rejects.toThrow('save_conflict');
  });
  it('llama a las RPC con el UID verificado por Auth y la lista completa, sin clave de servidor', async () => {
    await repo.reorderCourseSections('course', ['s3', 's1', 's2']);
    expect(rpc).toHaveBeenCalledWith('reorder_course_sections', {
      p_user_id: 'admin-uid', p_course_id: 'course', p_ordered_ids: ['s3', 's1', 's2'],
    });
    await repo.reorderSectionLessons('section', ['l3', 'l1']);
    expect(rpc).toHaveBeenLastCalledWith('reorder_section_lessons', {
      p_user_id: 'admin-uid', p_section_id: 'section', p_ordered_ids: ['l3', 'l1'],
    });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
  it('traduce permisos denegados y errores de la RPC sin exponer detalles', async () => {
    rpc.mockResolvedValueOnce({ error: { code: '42501', message: 'reorder_forbidden' } });
    await expect(repo.reorderCourseSections('course', ['s1', 's2'])).rejects.toThrow('forbidden');
    rpc.mockResolvedValueOnce({ error: { code: '22023', message: 'invalid_order' } });
    await expect(repo.reorderSectionLessons('section', ['l1', 'l2'])).rejects.toThrow('reorder_failed');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('no reordena sin sesión verificada ni con listas vacías o duplicadas', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'no session' } });
    await expect(repo.reorderCourseSections('course', ['s1'])).rejects.toThrow('unauthenticated');
    await expect(repo.reorderCourseSections('course', ['s1', 's1'])).rejects.toThrow('invalid_order');
    await expect(repo.reorderSectionLessons('section', [])).rejects.toThrow('invalid_order');
    expect(rpc).not.toHaveBeenCalled();
  });
});
