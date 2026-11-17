import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { Course, CourseValues, CoursesRepository } from './courses-repository';

const values: CourseValues = {
  slug: 'curso', title: 'Curso', summary: null, description: null,
  level: 'basico', status: 'draft', sort_order: 0, published_at: null,
};

describe('CoursesRepository', () => {
  const single = vi.fn();
  const select = vi.fn(() => ({ single, order }));
  const order = vi.fn();
  const returns = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const insert = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const remove = vi.fn();
  const from = vi.fn(() => ({ select, insert, update, delete: remove }));
  let repo: CoursesRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    order.mockReset().mockReturnValueOnce({ order }).mockReturnValue({ returns });
    returns.mockReset().mockResolvedValue({ data: [], error: null });
    single.mockResolvedValue({ data: { id: '1', ...values }, error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } }] });
    repo = TestBed.inject(CoursesRepository);
  });

  it('lista y crea usando la tabla pública', async () => {
    expect(await repo.list()).toEqual([]);
    await repo.save(values);
    expect(from).toHaveBeenCalledWith('courses');
    expect(insert).toHaveBeenCalledWith(values);
  });

  it('publica con fecha, conserva fecha anterior y archiva sin borrar', async () => {
    await repo.save({ ...values, status: 'published' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ published_at: expect.any(String) }));
    await repo.save({ ...values, status: 'published' }, { ...values, id: '1' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', published_at: expect.any(String) }));
    const existing: Course = { ...values, id: '1', published_at: '2026-01-01T00:00:00Z' };
    await repo.save({ ...values, status: 'published' }, existing);
    expect(update).toHaveBeenCalledWith({ ...values, status: 'published', published_at: existing.published_at });
    await repo.save({ ...values, status: 'archived' }, existing);
    expect(eq).toHaveBeenCalledWith('id', '1');
    expect(update).toHaveBeenCalledWith({ ...values, status: 'archived', published_at: existing.published_at });
    expect(remove).not.toHaveBeenCalled();
  });

  it('no filtra errores del SDK', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'private' } });
    await expect(repo.save(values)).rejects.toThrow('save_failed');
    await expect(repo.save(values, { ...values, id: '1' })).rejects.toThrow('save_failed');
  });

  it('trata null sin error como lista vacía y no filtra errores de listado', async () => {
    returns.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.list()).toEqual([]);
    order.mockReturnValueOnce({ order });
    returns.mockResolvedValueOnce({ data: null, error: { message: 'private' } });
    await expect(repo.list()).rejects.toThrow('list_failed');
  });
});

describe('CoursesRepository sin configuración', () => {
  it('rechaza lecturas y escrituras sin cliente', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    const repo = TestBed.inject(CoursesRepository);
    await expect(repo.list()).rejects.toThrow('unavailable');
    await expect(repo.save(values)).rejects.toThrow('unavailable');
  });
});
