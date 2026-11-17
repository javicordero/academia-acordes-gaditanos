import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import { PreviewRepository } from './preview-repository';

describe('PreviewRepository', () => {
  const course = '11111111-1111-1111-1111-111111111111';
  const s1 = '22222222-2222-2222-2222-222222222222';
  const s2 = '33333333-3333-3333-3333-333333333333';
  const l1 = '44444444-4444-4444-4444-444444444444';
  const l2 = '55555555-5555-5555-5555-555555555555';
  const admin = signal(false);
  const session = signal<{ user: { id: string } } | null>(null);
  const rows: Record<string, unknown> = {
    courses: { id: course, title: 'Curso' },
    course_sections: [{ id: s1, course_id: course }, { id: s2, course_id: course }],
    lessons: [{ id: l2, course_id: course, section_id: s2 }, { id: l1, course_id: course, section_id: s1 }],
  };
  const eq = vi.fn();
  const from = vi.fn((table: string) => {
    const result = { data: rows[table], error: null };
    const chain = { select: () => chain, eq: (...args: unknown[]) => { eq(...args); return chain; },
      order: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result) };
    return chain;
  });
  beforeEach(() => {
    admin.set(false); session.set(null); from.mockClear(); eq.mockClear();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { isAdmin: admin, session, whenInitialized: async () => {}, whenRoleResolved: async () => {} } },
      { provide: SUPABASE_CLIENT, useValue: { from } },
    ] });
  });
  it('rechaza UUID inválidos y usuarios no administradores sin consultar', async () => {
    const repo = TestBed.inject(PreviewRepository);
    expect(await repo.load('x', null)).toBeNull();
    session.set({ user: { id: 'user' } });
    expect(await repo.load(course, null)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it('selecciona por curso y orden de bloques, incluso borradores', async () => {
    session.set({ user: { id: 'admin' } }); admin.set(true);
    const result = await TestBed.inject(PreviewRepository).load(course, null);
    expect(result?.lesson?.id).toBe(l1);
    expect(result?.lessons.map(l => l.id)).toEqual([l1, l2]);
    expect(eq).toHaveBeenCalledWith('id', course);
    expect(eq).toHaveBeenCalledWith('course_id', course);
    expect((await TestBed.inject(PreviewRepository).load(course, l2))?.lesson?.id).toBe(l2);
    expect((await TestBed.inject(PreviewRepository).load(course, s1))?.lesson).toBeNull();
  });
});
