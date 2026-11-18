import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { LessonCommentsError, MAX_COMMENT_LENGTH } from './lesson-comment';
import { LessonCommentsRepository } from './lesson-comments-repository';

const LESSON = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ROOT = '11111111-1111-1111-1111-111111111111';
const REPLY = '22222222-2222-2222-2222-222222222222';
const NEW_ROOT = '33333333-3333-3333-3333-333333333333';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOT,
    parent_id: null,
    body: 'Una duda sobre el rasgueo',
    created_at: '2026-11-18T10:00:00Z',
    author_display_name: 'Alumno',
    author_is_admin: false,
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<LessonCommentsError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LessonCommentsError);
    return error as LessonCommentsError;
  }
  throw new Error('Se esperaba un error tipado');
}

describe('Repositorio de comentarios de lección', () => {
  const rpc = vi.fn();
  let repo: LessonCommentsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [], error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { rpc } }] });
    repo = TestBed.inject(LessonCommentsRepository);
  });

  it('lista por RPC con el id de lección y valida cada fila', async () => {
    rpc.mockResolvedValueOnce({ data: [row(), row({ id: REPLY, parent_id: ROOT, author_is_admin: true })], error: null });
    const result = await repo.list(LESSON);

    expect(rpc).toHaveBeenCalledWith('list_lesson_comments', { p_lesson_id: LESSON });
    expect(result).toEqual([
      { id: ROOT, parentId: null, body: 'Una duda sobre el rasgueo', createdAt: '2026-11-18T10:00:00Z',
        authorDisplayName: 'Alumno', authorIsAdmin: false },
      { id: REPLY, parentId: ROOT, body: 'Una duda sobre el rasgueo', createdAt: '2026-11-18T10:00:00Z',
        authorDisplayName: 'Alumno', authorIsAdmin: true },
    ]);
    expect(JSON.stringify(result)).not.toContain('email');
  });

  it('publica una raíz con cuerpo recortado y una respuesta con su padre', async () => {
    rpc.mockResolvedValueOnce({
      data: row({ id: '33333333-3333-3333-3333-333333333333', parent_id: null, body: 'Gracias' }),
      error: null,
    });
    const created = await repo.create(LESSON, '  Gracias  ', null);
    expect(rpc).toHaveBeenCalledWith('create_lesson_comment', {
      p_lesson_id: LESSON, p_body: 'Gracias', p_parent_id: null,
    });
    expect(created.parentId).toBeNull();

    rpc.mockResolvedValueOnce({ data: row({ id: REPLY, parent_id: ROOT }), error: null });
    await repo.create(LESSON, 'Respuesta', ROOT);
    expect(rpc).toHaveBeenLastCalledWith('create_lesson_comment', {
      p_lesson_id: LESSON, p_body: 'Respuesta', p_parent_id: ROOT,
    });
  });

  it('publica leyendo la única fila del conjunto que devuelve la RPC real', async () => {
    // `create_lesson_comment` es `returns table(...)`: PostgREST responde con
    // un array incluso cuando inserta una sola fila. El bug ocultó la sección
    // al tratar ese array como si fuera un objeto inválido.
    rpc.mockResolvedValueOnce({
      data: [row({ id: NEW_ROOT, parent_id: null, body: 'Comentario real' })],
      error: null,
    });
    const created = await repo.create(LESSON, 'Comentario real', null);
    expect(created.id).toBe(NEW_ROOT);
    expect(created.body).toBe('Comentario real');
    expect(created.parentId).toBeNull();
  });

  it('rechaza payloads inválidos sin llamar a la RPC', async () => {
    const invalidBodies: unknown[] = [
      '', '   ', 42, null, 'x'.repeat(MAX_COMMENT_LENGTH + 1),
    ];
    for (const body of invalidBodies) {
      expect((await failure(repo.create(LESSON, body as string, null))).kind).toBe('invalid');
    }
    const invalidParents: unknown[] = ['no-uuid', 7, undefined];
    for (const parent of invalidParents) {
      expect((await failure(repo.create(LESSON, 'Hola', parent as string | null))).kind).toBe('invalid');
    }
    expect((await failure(repo.create('', 'Hola', null))).kind).toBe('invalid');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza filas con tipos, longitudes, UUID o booleano incorrectos', async () => {
    const invalidRows = [
      row({ id: 'no-uuid' }),
      row({ parent_id: 'no-uuid' }),
      row({ parent_id: 7 }),
      row({ body: 42 }),
      row({ body: '' }),
      row({ body: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }),
      row({ created_at: 'no-fecha' }),
      row({ created_at: 123 }),
      row({ author_display_name: '' }),
      row({ author_display_name: 'x'.repeat(201) }),
      row({ author_display_name: 5 }),
      row({ author_is_admin: 'true' }),
      row({ author_is_admin: 1 }),
      null,
    ];
    for (const bad of invalidRows) {
      rpc.mockResolvedValueOnce({ data: [bad], error: null });
      expect((await failure(repo.list(LESSON))).kind).toBe('invalid');
    }
    rpc.mockResolvedValueOnce({ data: [row()], error: null });
    await expect(repo.list(LESSON)).resolves.toHaveLength(1);
  });

  it('traduce permisos denegados y fallos sin filtrar el mensaje raw', async () => {
    const secret = 'https://ejemplo.test/rpc?token=secreto&email=alumno@ejemplo.test';
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: secret } });
    expect((await failure(repo.list(LESSON))).kind).toBe('forbidden');

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX', message: 'permission denied for table' } });
    expect((await failure(repo.list(LESSON))).kind).toBe('forbidden');

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX', message: secret } });
    expect((await failure(repo.create(LESSON, 'Hola', null))).kind).toBe('failed');
  });

  it('sin cliente configurado no intenta ninguna RPC', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    const unconfigured = TestBed.inject(LessonCommentsRepository);
    expect((await failure(unconfigured.list(LESSON))).kind).toBe('unconfigured');
    expect((await failure(unconfigured.create(LESSON, 'Hola', null))).kind).toBe('unconfigured');
    expect((await failure(unconfigured.deleteComment(ROOT))).kind).toBe('unconfigured');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('borra por RPC con un booleano validado y sin filtrar datos', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(repo.deleteComment(ROOT)).resolves.toEqual({ threadDeleted: false });
    expect(rpc).toHaveBeenCalledWith('delete_lesson_comment', { p_comment_id: ROOT });
  });

  it('rechaza ids y respuestas de borrado inválidas sin llamar a la RPC', async () => {
    for (const id of ['no-uuid', '', 7, null, undefined]) {
      expect((await failure(repo.deleteComment(id as string))).kind).toBe('invalid');
    }
    expect(rpc).not.toHaveBeenCalled();
    for (const data of [null, 1, 'true', {}, [true], { deleted: true }]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect((await failure(repo.deleteComment(ROOT))).kind).toBe('invalid');
    }
  });

  it('sanea los errores de borrado sin exponer mensajes, tokens ni correos', async () => {
    const secret = 'https://ejemplo.test/rpc?token=secreto&email=alumno@ejemplo.test';
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: secret } });
    expect((await failure(repo.deleteComment(ROOT))).kind).toBe('forbidden');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX', message: secret } });
    const error = await failure(repo.deleteComment(ROOT));
    expect(error.kind).toBe('failed');
    expect(error.message).not.toContain('secreto');
    expect(error.message).not.toContain('@');
  });
});
