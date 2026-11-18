import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { LibraryCourse, MisCursosRepository } from './mis-cursos-repository';

interface Result {
  data: unknown;
  error: { message: string } | null;
}
interface Filters {
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  in: Record<string, unknown[]>;
}
type Handler = (filters: Filters) => Result;

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message = 'error'): Result => ({ data: null, error: { message } });

const publishedRows = [
  { id: 'a', slug: 'curso-a', title: 'Curso A', summary: null, level: 'basico' },
  { id: 'b', slug: 'curso-b', title: 'Curso B', summary: null, level: 'iniciacion' },
];
const sections: Record<string, unknown[]> = {
  a: [{ id: 'sa', position: 0 }],
  b: [{ id: 'sb', position: 0 }],
};
const lessons: Record<string, unknown[]> = {
  a: [
    { id: 'la1', slug: 'a-uno', section_id: 'sa', position: 0 },
    { id: 'la2', slug: 'a-dos', section_id: 'sa', position: 1 },
  ],
  b: [{ id: 'lb1', slug: 'b-uno', section_id: 'sb', position: 0 }],
};
const progressRows = [
  { lesson_id: 'la1', completed_at: '2026-01-01', last_activity_at: '2026-01-01' },
];

/** Cliente falso que aplica de verdad los filtros eq/is/in de PostgREST. */
function fakeClient(handlers: Record<string, Handler>) {
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const filters: Filters = { eq: {}, is: {}, in: {} };
    const chain: Record<string, unknown> = {
      select: vi.fn((columns: string) => {
        calls.push([table, 'select', columns]);
        return chain;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push([table, 'eq', column, value]);
        filters.eq[column] = value;
        return chain;
      }),
      is: vi.fn((column: string, value: unknown) => {
        calls.push([table, 'is', column, value]);
        filters.is[column] = value;
        return chain;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        calls.push([table, 'in', column, values]);
        filters.in[column] = values;
        return chain;
      }),
      order: vi.fn((column: string) => {
        calls.push([table, 'order', column]);
        return chain;
      }),
      returns: vi.fn(() => Promise.resolve((handlers[table] ?? (() => ok([])))(filters))),
    };
    return chain;
  });
  return { from, calls };
}

function handlersFor(options: {
  userId?: string;
  failRights?: boolean;
  failCourses?: boolean;
  failCourse?: string;
  failProgressFor?: string;
  withHidden?: boolean;
  noRights?: boolean;
} = {}) {
  const userId = options.userId ?? 'u';
  const entitled = options.withHidden === false ? ['a', 'b'] : ['a', 'b', 'hidden'];
  return {
    entitlements: (filters: Filters): Result => {
      if (options.failRights) return fail();
      if (options.noRights || filters.eq['user_id'] !== userId) return ok([]);
      return ok(entitled.map((course_id) => ({ course_id })));
    },
    courses: (filters: Filters): Result => {
      if (options.failCourses) return fail();
      const ids = filters.in['id'] as string[];
      return ok(publishedRows.filter((row) => ids.includes(row.id)));
    },
    course_sections: (filters: Filters): Result => {
      const id = filters.eq['course_id'] as string;
      if (id === options.failCourse) return fail();
      return ok(sections[id] ?? []);
    },
    lessons: (filters: Filters): Result => {
      const id = filters.eq['course_id'] as string;
      if (id === options.failCourse) return fail();
      return ok((lessons[id] ?? []).filter((row) => filters.eq['is_published'] === true));
    },
    lesson_progress: (filters: Filters): Result => {
      const ids = filters.in['lesson_id'] as string[];
      if (options.failProgressFor && ids.some((id) => id.startsWith(options.failProgressFor!))) return fail();
      return ok(progressRows.filter((row) =>
        ids.includes(row.lesson_id) && filters.eq['user_id'] === userId));
    },
  };
}

function setup(options: Parameters<typeof handlersFor>[0] = {}) {
  TestBed.resetTestingModule();
  const client = fakeClient(handlersFor(options));
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: client }] });
  return { repo: TestBed.inject(MisCursosRepository), calls: client.calls };
}

const card = (id: string): LibraryCourse => ({
  id,
  slug: `curso-${id}`,
  title: `Curso ${id.toUpperCase()}`,
  summary: null,
  level: 'basico',
  total: 0,
  completed: 0,
  percent: 0,
  resume: null,
});

describe('MisCursosRepository', () => {
  it('mezcla éxito, unavailable y fallo puntual conservando la tarjeta válida y conteos coherentes', async () => {
    const { repo, calls } = setup({ failCourse: 'b' });
    const library = await repo.load('u');

    expect(library.courses.map((course) => course.id)).toEqual(['a']);
    expect(library.courses[0]).toMatchObject({ total: 2, completed: 1, percent: 50, resume: 'a-uno' });
    expect(library.unavailable).toBe(1);
    expect(library.problems).toEqual([
      { courseId: 'hidden', kind: 'unavailable' },
      { courseId: 'b', kind: 'failed' },
    ]);
    expect(calls).toContainEqual(['entitlements', 'eq', 'user_id', 'u']);
    expect(calls).toContainEqual(['entitlements', 'is', 'revoked_at', null]);
    expect(calls).toContainEqual(['courses', 'in', 'id', ['a', 'b', 'hidden']]);
    expect(calls).toContainEqual(['courses', 'eq', 'status', 'published']);
    expect(calls).toContainEqual(['lesson_progress', 'in', 'lesson_id', ['la1', 'la2']]);
    expect(calls).toContainEqual(['lesson_progress', 'eq', 'user_id', 'u']);
  });

  it('un fallo de progreso de un curso no tumba a los demás', async () => {
    const { repo } = setup({ failProgressFor: 'lb' });
    const library = await repo.load('u');
    expect(library.courses.map((course) => course.id)).toEqual(['a']);
    expect(library.problems).toContainEqual({ courseId: 'b', kind: 'failed' });
    expect(library.unavailable).toBe(1);
  });

  it('un curso sin lecciones publicadas es válido con 0/0 y sin continuación', async () => {
    const client = fakeClient({
      ...handlersFor({ withHidden: false }),
      lessons: () => ok([]),
      course_sections: () => ok([]),
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: client }] });
    const library = await TestBed.inject(MisCursosRepository).load('u');
    expect(library.courses).toHaveLength(2);
    expect(library.courses[0]).toMatchObject({ total: 0, completed: 0, percent: 0, resume: null });
  });

  it('no consulta cursos ni progreso sin derechos activos', async () => {
    const { repo, calls } = setup({ noRights: true });
    const library = await repo.load('otro');
    expect(library).toEqual({ courses: [], unavailable: 0, problems: [] });
    expect(calls.some((call) => call[0] === 'courses')).toBe(false);
    expect(calls.some((call) => call[0] === 'lesson_progress')).toBe(false);
  });

  it('un fallo de derechos o del listado de cursos es error global honesto', async () => {
    const rights = setup({ failRights: true });
    await expect(rights.repo.load('u')).rejects.toThrow('load');
    expect(rights.calls.some((call) => call[0] === 'courses')).toBe(false);

    const courses = setup({ failCourses: true });
    await expect(courses.repo.load('u')).rejects.toThrow('load');
  });

  it('el reintento pide solo cursos fallidos, conserva los válidos y no duplica por ID', async () => {
    const first = setup({ failCourse: 'b' });
    const prior = await first.repo.load('u');
    expect(prior.courses.map((course) => course.id)).toEqual(['a']);

    // El servidor ya no falla: el reintento recupera solo 'b'.
    const second = setup();
    const before = second.calls.length;
    const retried = await second.repo.load('u', { courses: prior.courses, problems: prior.problems });
    expect(retried.courses.map((course) => course.id)).toEqual(['a', 'b']);
    expect(retried.courses[0]).toBe(prior.courses[0]);
    expect(retried.unavailable).toBe(1);
    expect(retried.problems).toEqual([{ courseId: 'hidden', kind: 'unavailable' }]);

    const newCalls = second.calls.slice(before);
    expect(newCalls).toContainEqual(['courses', 'in', 'id', ['b']]);
    expect(newCalls.filter((call) => call[0] === 'entitlements')).toEqual([]);
  });

  it('un reintento que sigue fallando mantiene válidos, unavailable y el problema failed', async () => {
    const { repo } = setup({ failCourse: 'b' });
    const previous = {
      courses: [card('a')],
      problems: [
        { courseId: 'hidden', kind: 'unavailable' as const },
        { courseId: 'b', kind: 'failed' as const },
      ],
    };
    const library = await repo.load('u', previous);
    expect(library.courses.map((course) => course.id)).toEqual(['a']);
    expect(library.unavailable).toBe(1);
    expect(library.problems).toEqual(previous.problems);
    expect(library.courses[0]).toBe(previous.courses[0]);
  });

  it('cargas simultáneas de usuarios distintos no mezclan derechos ni progreso', async () => {
    const client = fakeClient({
      ...handlersFor(),
      entitlements: (filters: Filters) => ok(
        filters.eq['user_id'] === 'u' ? [{ course_id: 'a' }] : [{ course_id: 'b' }]),
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: client }] });
    const repo = TestBed.inject(MisCursosRepository);
    const [mine, other] = await Promise.all([repo.load('u'), repo.load('otro')]);
    expect(mine.courses.map((course) => course.id)).toEqual(['a']);
    expect(other.courses.map((course) => course.id)).toEqual(['b']);
  });

  it('rechaza una conexión no configurada', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    await expect(TestBed.inject(MisCursosRepository).load('u')).rejects.toThrow('unconfigured');
  });
});
