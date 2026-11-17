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
  const values = { title: 'Lección', slug: 'leccion', summary: null, content_md: null,
    duration_seconds: null, is_free_preview: false, is_published: false, content_type: 'pdf' as const };
  let repo: StructureRepository;
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue(query); eq.mockReturnValue(query); insert.mockReturnValue(query); update.mockReturnValue(query);
    order.mockResolvedValue({ data: [], error: null }); single.mockResolvedValue({ data: { id: 'id' }, error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } }] });
    repo = TestBed.inject(StructureRepository);
  });
  it('lista solo el curso ordenado y crea con claves compuestas y posición', async () => {
    expect(await repo.list('course')).toEqual({ sections: [], lessons: [] });
    expect(eq).toHaveBeenCalledWith('course_id', 'course');
    expect(order).toHaveBeenCalledWith('position');
    await repo.saveSection('course', { title: 'Bloque', summary: null }, 2);
    expect(insert).toHaveBeenCalledWith({ title: 'Bloque', summary: null, course_id: 'course', position: 2 });
    await repo.saveLesson('course', 'section', values, 3);
    expect(insert).toHaveBeenCalledWith({ ...values, course_id: 'course', section_id: 'section', position: 3 });
    expect(remove).not.toHaveBeenCalled();
  });
  it('actualiza sin cambiar curso, bloque ni posición', async () => {
    const existing: Lesson = { ...values, id: 'lesson', course_id: 'course', section_id: 'section', position: 3 };
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
    await expect(repo.saveLesson('course', 'section', values, 0)).rejects.toThrow('save_failed');
  });
});
