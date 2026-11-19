import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { LessonFavoritesError } from './lesson-favorite';
import { LessonFavoritesRepository } from './repository';

const LESSON = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COURSE = '11111111-1111-1111-1111-111111111111';
const SECTION = '22222222-2222-2222-2222-222222222222';

function row(overrides: Record<string, unknown> = {}) {
  return {
    lesson_id: LESSON,
    lesson_slug: 'rasgueo-basico',
    lesson_title: 'Rasgueo básico',
    course_id: COURSE,
    course_slug: 'pasodoble',
    course_title: 'Pasodoble desde cero',
    section_id: SECTION,
    section_title: 'Mano derecha',
    position: 2,
    created_at: '2026-11-18T10:00:00Z',
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<LessonFavoritesError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LessonFavoritesError);
    return error as LessonFavoritesError;
  }
  throw new Error('Se esperaba un error tipado');
}

describe('Repositorio de favoritos de lección', () => {
  const rpc = vi.fn();
  let repo: LessonFavoritesRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [], error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { rpc } }] });
    repo = TestBed.inject(LessonFavoritesRepository);
  });

  it('lista por RPC sin argumentos y valida cada fila', async () => {
    rpc.mockResolvedValueOnce({ data: [row(), row({ lesson_id: '33333333-3333-3333-3333-333333333333', position: 0 })], error: null });

    const result = await repo.list();

    expect(rpc).toHaveBeenCalledWith('list_my_lesson_favorites');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      lessonId: LESSON,
      lessonSlug: 'rasgueo-basico',
      lessonTitle: 'Rasgueo básico',
      courseId: COURSE,
      courseSlug: 'pasodoble',
      courseTitle: 'Pasodoble desde cero',
      sectionId: SECTION,
      sectionTitle: 'Mano derecha',
      position: 2,
      createdAt: '2026-11-18T10:00:00Z',
    });
    expect(JSON.stringify(result)).not.toContain('@');
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('rechaza respuestas que no son un conjunto de filas', async () => {
    for (const data of [null, undefined, row(), 'favoritos', 42]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect((await failure(repo.list())).kind).toBe('invalid');
    }
  });

  it('rechaza filas con IDs, textos, posición o fecha inválidos', async () => {
    const badRows = [
      row({ lesson_id: 'no-uuid' }),
      row({ course_id: 7 }),
      row({ section_id: null }),
      row({ lesson_slug: '' }),
      row({ lesson_title: 42 }),
      row({ course_slug: 'x'.repeat(301) }),
      row({ course_title: '   ' }),
      row({ section_title: null }),
      row({ position: -1 }),
      row({ position: 1.5 }),
      row({ position: '2' }),
      row({ created_at: 'no-fecha' }),
      row({ created_at: 123 }),
      null,
    ];
    for (const bad of badRows) {
      rpc.mockResolvedValueOnce({ data: [bad], error: null });
      expect((await failure(repo.list())).kind).toBe('invalid');
    }
    rpc.mockResolvedValueOnce({ data: [row()], error: null });
    await expect(repo.list()).resolves.toHaveLength(1);
  });

  it('sanea errores de lectura sin filtrar mensajes, correos ni tokens', async () => {
    const secret = 'https://ejemplo.test/rpc?token=secreto&email=alumno@ejemplo.test';
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: secret } });
    expect((await failure(repo.list())).kind).toBe('forbidden');

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX', message: 'permission denied for table' } });
    expect((await failure(repo.list())).kind).toBe('forbidden');

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX', message: secret } });
    const error = await failure(repo.list());
    expect(error.kind).toBe('failed');
    expect(error.message).not.toContain('secreto');
    expect(error.message).not.toContain('@');
  });

  it('alterna con el id de lección y acepta solo booleanos del servidor', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(repo.toggle(LESSON)).resolves.toBe(true);
    expect(rpc).toHaveBeenLastCalledWith('toggle_lesson_favorite', { p_lesson_id: LESSON });

    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(repo.toggle(LESSON)).resolves.toBe(false);
  });

  it('rechaza ids y respuestas de alternancia inválidas', async () => {
    for (const id of ['no-uuid', '', 7, null, undefined]) {
      expect((await failure(repo.toggle(id as string))).kind).toBe('invalid');
    }
    expect(rpc).not.toHaveBeenCalled();

    for (const data of [null, 1, 'true', {}, [true]]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect((await failure(repo.toggle(LESSON))).kind).toBe('invalid');
    }
  });

  it('sanea errores de alternancia y no opera sin cliente', async () => {
    const secret = 'clave=secreta alumno@ejemplo.test';
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX', message: secret } });
    const error = await failure(repo.toggle(LESSON));
    expect(error.kind).toBe('failed');
    expect(error.message).not.toContain('secreta');
    expect(error.message).not.toContain('@');

    rpc.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    const unconfigured = TestBed.inject(LessonFavoritesRepository);
    expect((await failure(unconfigured.list())).kind).toBe('unconfigured');
    expect((await failure(unconfigured.toggle(LESSON))).kind).toBe('unconfigured');
    expect(rpc).not.toHaveBeenCalled();
  });
});
