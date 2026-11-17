import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { MisCursosRepository } from './mis-cursos-repository';

describe('MisCursosRepository', () => {
  const ok = (data: unknown) => ({ data, error: null });
  function setup(results: Record<string, unknown[]>) {
    const calls: unknown[][] = [];
    const client = { from: (table: string) => {
      const record = (method: string, ...args: unknown[]) => { calls.push([table, method, ...args]); return query; };
      const query = {
        select: (...args: unknown[]) => record('select', ...args), eq: (...args: unknown[]) => record('eq', ...args),
        is: (...args: unknown[]) => record('is', ...args), in: (...args: unknown[]) => record('in', ...args),
        order: (...args: unknown[]) => record('order', ...args),
        returns: () => Promise.resolve(results[table]?.shift() ?? ok([])),
      };
      return query;
    }};
    TestBed.configureTestingModule({providers: [{provide: SUPABASE_CLIENT, useValue: client}]});
    return {repo: TestBed.inject(MisCursosRepository), calls};
  }
  it('limita derechos, cursos, lecciones y progreso y cuenta solo lecciones accesibles', async () => {
    const {repo, calls} = setup({
      entitlements: [ok([{course_id: 'c'}, {course_id: 'hidden'}])],
      courses: [ok([{id: 'c', slug: 'curso', title: 'Curso', summary: null, level: 'basico'}])],
      course_sections: [ok([{id: 's', position: 0}])],
      lessons: [ok([{id: 'l1', slug: 'uno', section_id: 's', position: 0}, {id: 'l2', slug: 'dos', section_id: 's', position: 1}])],
      lesson_progress: [ok([{lesson_id: 'l1', completed_at: '2026-01-01', last_activity_at: '2026-01-01'}])],
    });
    const data = await repo.load('u');
    expect(data.unavailable).toBe(1);
    expect(data.courses[0]).toMatchObject({completed: 1, total: 2, percent: 50, resume: 'uno'});
    expect(calls).toContainEqual(['entitlements', 'eq', 'user_id', 'u']);
    expect(calls).toContainEqual(['entitlements', 'is', 'revoked_at', null]);
    expect(calls).toContainEqual(['courses', 'in', 'id', ['c', 'hidden']]);
    expect(calls).toContainEqual(['courses', 'eq', 'status', 'published']);
    expect(calls).toContainEqual(['lessons', 'eq', 'course_id', 'c']);
    expect(calls).toContainEqual(['lessons', 'eq', 'is_published', true]);
    expect(calls).toContainEqual(['lesson_progress', 'eq', 'user_id', 'u']);
    expect(calls).toContainEqual(['lesson_progress', 'in', 'lesson_id', ['l1', 'l2']]);
  });
  it('no otorga acceso por rol y evita consultas sin derechos', async () => {
    const {repo, calls} = setup({entitlements: [ok([])]});
    expect(await repo.load('admin')).toEqual({courses: [], unavailable: 0});
    expect(calls.some(call => call[0] === 'courses')).toBe(false);
  });
  it('maneja curso sin lecciones y no inventa continuación', async () => {
    const {repo} = setup({entitlements: [ok([{course_id: 'c'}])], courses: [ok([{id:'c'}])], course_sections: [ok([])], lessons: [ok([])]});
    expect((await repo.load('u')).courses[0]).toMatchObject({total: 0, completed: 0, percent: 0, resume: null});
  });
  it('elige la primera pendiente en orden de bloque si no hay actividad', async () => {
    const {repo} = setup({
      entitlements: [ok([{course_id: 'c'}])], courses: [ok([{id:'c'}])],
      course_sections: [ok([{id:'s1', position: 0}, {id:'s2', position: 1}])],
      lessons: [ok([{id:'b', slug:'segunda', section_id:'s2', position: 0}, {id:'a', slug:'primera', section_id:'s1', position: 1}])],
      lesson_progress: [ok([])],
    });
    expect((await repo.load('u')).courses[0].resume).toBe('primera');
  });
  it('propaga errores de SDK', async () => {
    const {repo} = setup({entitlements: [{data: null, error: {message: 'error'}}]});
    await expect(repo.load('u')).rejects.toThrow('load');
  });
  it('rechaza conexión no configurada', async () => {
    TestBed.configureTestingModule({providers: [{provide: SUPABASE_CLIENT, useValue: null}]});
    await expect(TestBed.inject(MisCursosRepository).load('u')).rejects.toThrow('unconfigured');
  });
});
