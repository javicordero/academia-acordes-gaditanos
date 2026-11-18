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
    expect(lessonsQuery.select).toHaveBeenCalledWith('id,section_id,slug,title,is_free_preview');
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

  describe('acceso al curso', () => {
    function setupAccess(rows: unknown[] | { data: null; error: { message: string } }) {
      const calls: unknown[][] = [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((...args: unknown[]) => { calls.push(['eq', ...args]); return query; }),
        returns: vi.fn().mockResolvedValue(Array.isArray(rows) ? { data: rows, error: null } : rows),
      };
      const from = vi.fn(() => query);
      TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } as unknown as SupabaseClient }] });
      return { repo: TestBed.inject(PublicCoursesRepository), query, from, calls };
    }

    it('distingue derecho activo, revocado y ausente solo con los campos necesarios', async () => {
      const { repo, query, from } = setupAccess([{ revoked_at: null }]);
      expect(await repo.access('c1', 'u1')).toBe('granted');
      expect(from).toHaveBeenCalledWith('entitlements');
      expect(query.select).toHaveBeenCalledWith('revoked_at');
      expect(query.select).not.toHaveBeenCalledWith('revocation_reason');
      expect(query.select).not.toHaveBeenCalledWith('id, revoked_at');
    });

    it('un derecho revocado no concede acceso', async () => {
      const { repo } = setupAccess([{ revoked_at: '2026-01-01T00:00:00Z' }]);
      expect(await repo.access('c1', 'u1')).toBe('revoked');
    });

    it('un admin sin fila de derecho no obtiene acceso', async () => {
      const { repo } = setupAccess([]);
      expect(await repo.access('c1', 'admin')).toBe('none');
    });

    it('si hay varias filas y alguna activa, concede acceso', async () => {
      const { repo } = setupAccess([{ revoked_at: '2025-01-01T00:00:00Z' }, { revoked_at: null }]);
      expect(await repo.access('c1', 'u1')).toBe('granted');
    });

    it('traduce un error del SDK a failed y no a «sin acceso»', async () => {
      const { repo } = setupAccess({ data: null, error: { message: 'detalle interno' } });
      await expect(repo.access('c1', 'u1')).rejects.toThrow('failed');
    });

    it('filtra siempre por el propio usuario, sin confiar en el rol', async () => {
      const { repo, calls } = setupAccess([]);
      await repo.access('c1', 'u1');
      expect(calls).toContainEqual(['eq', 'user_id', 'u1']);
      expect(calls).toContainEqual(['eq', 'course_id', 'c1']);
    });
  });
});
