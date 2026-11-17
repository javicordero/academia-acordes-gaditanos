import { TestBed } from '@angular/core/testing';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { PublicCoursesRepository } from './public-courses-repository';
import { describe, expect, it, vi } from 'vitest';

describe('PublicCoursesRepository', () => {
  it('informa de configuración ausente', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    await expect(TestBed.inject(PublicCoursesRepository).list()).rejects.toThrow('unavailable');
  });

  it('filtra publicados incluso con sesión admin y consulta el slug', async () => {
    const query = {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(), returns: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.returns.mockResolvedValue({ data: [], error: null });
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const from = vi.fn().mockReturnValue(query);
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } as unknown as SupabaseClient }] });
    const repo = TestBed.inject(PublicCoursesRepository);
    expect(await repo.list()).toEqual([]);
    expect(await repo.detail('ejemplo')).toBeNull();
    expect(query.eq).toHaveBeenCalledWith('status', 'published');
    expect(query.eq).toHaveBeenCalledWith('slug', 'ejemplo');
  });

  it('filtra siempre las lecciones publicadas por curso aunque el SDK se comporte como admin', async () => {
    const course = { id: 'curso-1', slug: 'ejemplo', title: 'Ejemplo', summary: null, description: null, level: 'basico' };
    const makeQuery = () => {
      const q = {
        select: vi.fn(), eq: vi.fn(), order: vi.fn(), returns: vi.fn(), maybeSingle: vi.fn(),
      };
      q.select.mockReturnValue(q);
      q.eq.mockReturnValue(q);
      q.order.mockReturnValue(q);
      q.returns.mockResolvedValue({ data: [], error: null });
      // SDK "admin": devuelve el curso sin depender de RLS.
      q.maybeSingle.mockResolvedValue({ data: course, error: null });
      return q;
    };
    const coursesQuery = makeQuery();
    const sectionsQuery = makeQuery();
    const lessonsQuery = makeQuery();
    const from = vi.fn((table: string) => {
      if (table === 'courses') return coursesQuery;
      if (table === 'course_sections') return sectionsQuery;
      if (table === 'lessons') return lessonsQuery;
      throw new Error(`tabla inesperada: ${table}`);
    });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } as unknown as SupabaseClient }] });
    const detail = await TestBed.inject(PublicCoursesRepository).detail('ejemplo');

    expect(detail).not.toBeNull();
    expect(from).toHaveBeenCalledWith('lessons');
    expect(lessonsQuery.select).toHaveBeenCalledWith('id,section_id,title,is_free_preview');
    expect(lessonsQuery.eq).toHaveBeenCalledWith('course_id', 'curso-1');
    expect(lessonsQuery.eq).toHaveBeenCalledWith('is_published', true);
  });

  it('no expone errores del SDK', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), returns: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    query.returns.mockResolvedValue({ data: null, error: { message: 'detalle interno' } });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from: () => query } }] });
    await expect(TestBed.inject(PublicCoursesRepository).list()).rejects.toThrow('failed');
  });
});
