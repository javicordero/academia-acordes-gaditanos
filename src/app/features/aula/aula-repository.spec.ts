import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { AulaRepository } from './aula-repository';

describe('AulaRepository', () => {
  function setup(results: Record<string, unknown[]>) {
    const calls: unknown[][] = [];
    const client = { from: (table: string) => {
      const record = (method: string, ...args: unknown[]) => { calls.push([table, method, ...args]); return query; };
      const result = () => Promise.resolve(results[table]?.shift() ?? {data: null, error: null});
      const query = {
        select: (...args: unknown[]) => record('select', ...args),
        eq: (...args: unknown[]) => record('eq', ...args),
        in: (...args: unknown[]) => record('in', ...args),
        is: (...args: unknown[]) => record('is', ...args),
        order: (...args: unknown[]) => record('order', ...args),
        maybeSingle: result, returns: result,
        upsert: (...args: unknown[]) => { record('upsert', ...args); return result(); },
      };
      return query;
    }};
    TestBed.configureTestingModule({providers: [{provide: SUPABASE_CLIENT, useValue: client}]});
    return { repo: TestBed.inject(AulaRepository), calls };
  }
  const ok = (data: unknown) => ({data, error: null});
  const lesson = {id: 'l', section_id: 's', slug: 'uno', title: 'Uno', content_type: 'pdf'};

  it('filtra curso y lección publicados y no consulta progreso anónimo', async () => {
    const {repo, calls} = setup({courses: [ok({id: 'c', title: 'Curso'})], lessons: [ok(lesson), ok([lesson])], course_sections: [ok([])]});
    const data = await repo.load('curso', 'uno', null);
    expect(data?.canTrack).toBe(false);
    expect(calls).toContainEqual(['courses', 'eq', 'status', 'published']);
    expect(calls).toContainEqual(['lessons', 'eq', 'course_id', 'c']);
    expect(calls).toContainEqual(['lessons', 'eq', 'is_published', true]);
    const selects = calls.filter(c => c[0] === 'lessons' && c[1] === 'select').map(c => c[2]);
    expect(selects).toEqual(['id,section_id,slug,title,content_type', 'id,section_id,slug,title,content_type']);
    expect(selects.every(s => !/summary|content_md/.test(String(s)))).toBe(true);
    expect(data?.lesson.content_type).toBe('pdf');
    expect(calls.some(c => c[0] === 'lesson_progress')).toBe(false);
  });

  it('consulta derecho y progreso propios y guarda con timestamp', async () => {
    const {repo, calls} = setup({courses: [ok({id: 'c', title: 'Curso'})], lessons: [ok(lesson), ok([lesson])], course_sections: [ok([])], entitlements: [ok({id: 'e'})], lesson_progress: [ok([{lesson_id: 'l', completed_at: null}]), ok(null)]});
    const loaded = await repo.load('curso', 'uno', 'u');
    expect(loaded?.canTrack).toBe(true);
    expect(loaded?.completedLessonIds).toEqual([]);
    await repo.save('u', 'l', true);
    expect(calls).toContainEqual(['entitlements', 'eq', 'user_id', 'u']);
    expect(calls).toContainEqual(['lesson_progress', 'in', 'lesson_id', expect.arrayContaining(['l'])]);
    expect(calls).toContainEqual(['lesson_progress', 'upsert', expect.objectContaining({user_id: 'u', lesson_id: 'l', completed_at: expect.any(String), last_activity_at: expect.any(String)}), {onConflict: 'user_id,lesson_id'}]);
  });

  it('devuelve las lecciones completadas del curso en una sola consulta de progreso', async () => {
    const second = {...lesson, id: 'l2', slug: 'dos'};
    const {repo, calls} = setup({
      courses: [ok({id: 'c', title: 'Curso'})],
      lessons: [ok(lesson), ok([lesson, second])],
      course_sections: [ok([{id: 's', title: 'Bloque'}])],
      entitlements: [ok({id: 'e'})],
      lesson_progress: [ok([
        {lesson_id: 'l', completed_at: null},
        {lesson_id: 'l2', completed_at: '2026-11-18T10:00:00Z'},
      ])],
    });
    const loaded = await repo.load('curso', 'uno', 'u');
    expect(loaded?.completed).toBe(false);
    expect(loaded?.completedLessonIds).toEqual(['l2']);
    expect(calls.filter(c => c[0] === 'lesson_progress' && c[1] === 'select')).toHaveLength(1);
    expect(calls).toContainEqual(['lesson_progress', 'in', 'lesson_id', ['l', 'l2']]);
  });

  it('devuelve denegada sin distinguir ausencia y propaga errores', async () => {
    const {repo} = setup({courses: [ok(null), {data: null, error: {message: 'fallo'}}]});
    expect(await repo.load('curso', 'uno', null)).toBeNull();
    await expect(repo.load('curso', 'uno', null)).rejects.toThrow();
  });
});
