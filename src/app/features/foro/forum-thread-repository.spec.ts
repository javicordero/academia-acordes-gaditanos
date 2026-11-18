import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { ConversationError, MAX_CONVERSATION_LENGTH } from '../comentarios/conversation';
import {
  ForumThreadRepository,
  MAX_THREAD_TITLE_LENGTH,
} from './forum-thread-repository';

const CATEGORY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const POST = '11111111-1111-1111-1111-111111111111';
const REPLY = '22222222-2222-2222-2222-222222222222';
const CREATED = '33333333-3333-3333-3333-333333333333';

function category(overrides: Record<string, unknown> = {}) {
  return { id: CATEGORY, slug: 'pasodoble', title: 'Pasodoble', description: 'Ritmo y acompañamiento', position: 1, ...overrides };
}

function thread(overrides: Record<string, unknown> = {}) {
  return {
    id: THREAD, category_id: CATEGORY, title: 'Duda de rasgueo', created_at: '2026-11-18T10:00:00Z',
    author_display_name: 'Alumno', author_is_admin: false, reply_count: 2, ...overrides,
  };
}

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: POST, parent_id: null, body: 'Una duda', created_at: '2026-11-18T10:00:00Z',
    author_display_name: 'Profesor', author_is_admin: true, ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<ConversationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConversationError);
    return error as ConversationError;
  }
  throw new Error('Se esperaba un error tipado');
}

describe('Repositorio del foro (puerto de conversación)', () => {
  const rpc = vi.fn();
  let repo: ForumThreadRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [], error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { rpc } }] });
    repo = TestBed.inject(ForumThreadRepository);
  });

  it('lista categorías por RPC con forma validada', async () => {
    rpc.mockResolvedValueOnce({ data: [category()], error: null });
    expect(await repo.listCategories()).toEqual([category()]);
    expect(rpc).toHaveBeenCalledWith('list_forum_categories', {});
  });

  it('lista hilos por categoría con autor, fecha, respuestas y badge', async () => {
    rpc.mockResolvedValueOnce({ data: [thread({ author_is_admin: true, reply_count: 0 })], error: null });
    const result = await repo.listThreads(CATEGORY);
    expect(rpc).toHaveBeenCalledWith('list_forum_threads', { p_category_id: CATEGORY });
    expect(result[0]).toEqual({
      id: THREAD, categoryId: CATEGORY, title: 'Duda de rasgueo', createdAt: '2026-11-18T10:00:00Z',
      authorDisplayName: 'Alumno', authorIsAdmin: true, replyCount: 0,
    });
  });

  it('crea un hilo con título y cuerpo recortados y lee la única fila', async () => {
    rpc.mockResolvedValueOnce({ data: [thread({ id: CREATED, title: 'Nuevo tema', body: 'Cuerpo', reply_count: undefined })], error: null });
    const created = await repo.createThread(CATEGORY, '  Nuevo tema  ', '  Cuerpo  ');
    expect(rpc).toHaveBeenCalledWith('create_forum_thread', {
      p_category_id: CATEGORY, p_title: 'Nuevo tema', p_body: 'Cuerpo',
    });
    expect(created.id).toBe(CREATED);
    expect(created.categoryId).toBe(CATEGORY);
  });

  it('usa el mismo puerto que las dudas con list_thread_posts y create_thread_post', async () => {
    rpc.mockResolvedValueOnce({ data: [post(), post({ id: REPLY, parent_id: POST })], error: null });
    const posts = await repo.list(THREAD);
    expect(rpc).toHaveBeenCalledWith('list_thread_posts', { p_thread_id: THREAD });
    expect(posts).toEqual([
      { id: POST, parentId: null, body: 'Una duda', createdAt: '2026-11-18T10:00:00Z',
        authorDisplayName: 'Profesor', authorIsAdmin: true },
      { id: REPLY, parentId: POST, body: 'Una duda', createdAt: '2026-11-18T10:00:00Z',
        authorDisplayName: 'Profesor', authorIsAdmin: true },
    ]);

    rpc.mockResolvedValueOnce({ data: [post({ id: CREATED, parent_id: REPLY, body: 'Gracias' })], error: null });
    const created = await repo.create(THREAD, '  Gracias  ', REPLY);
    expect(rpc).toHaveBeenLastCalledWith('create_thread_post', {
      p_thread_id: THREAD, p_body: 'Gracias', p_parent_id: REPLY,
    });
    expect(created.parentId).toBe(REPLY);

    rpc.mockResolvedValueOnce({ data: [post({ id: CREATED })], error: null });
    await repo.create(THREAD, 'Raíz');
    expect(rpc).toHaveBeenLastCalledWith('create_thread_post', {
      p_thread_id: THREAD, p_body: 'Raíz', p_parent_id: null,
    });
  });

  it('rechaza entradas y filas inválidas sin llamar a la RPC', async () => {
    expect((await failure(repo.listThreads('no-uuid'))).kind).toBe('invalid');
    expect((await failure(repo.createThread('no-uuid', 'Título', 'Cuerpo'))).kind).toBe('invalid');
    expect((await failure(repo.createThread(CATEGORY, 'x'.repeat(MAX_THREAD_TITLE_LENGTH + 1), 'Cuerpo'))).kind).toBe('invalid');
    expect((await failure(repo.createThread(CATEGORY, 'Título', 'x'.repeat(MAX_CONVERSATION_LENGTH + 1)))).kind).toBe('invalid');
    expect((await failure(repo.list('no-uuid'))).kind).toBe('invalid');
    expect((await failure(repo.create(THREAD, 'Hola', 'no-uuid'))).kind).toBe('invalid');
    expect((await failure(repo.create(THREAD, '', null))).kind).toBe('invalid');
    expect(rpc).not.toHaveBeenCalled();

    const badRows = [
      category({ id: 'no-uuid' }), category({ position: -1 }), category({ position: 1.5 }),
      category({ description: 7 }), category({ title: '' }), null,
    ];
    for (const bad of badRows) {
      rpc.mockResolvedValueOnce({ data: [bad], error: null });
      expect((await failure(repo.listCategories())).kind).toBe('invalid');
    }
    const badThreads = [
      thread({ reply_count: -1 }), thread({ reply_count: '2' }), thread({ author_is_admin: 'true' }),
      thread({ category_id: 'no-uuid' }), thread({ created_at: 'no-fecha' }), null,
    ];
    for (const bad of badThreads) {
      rpc.mockResolvedValueOnce({ data: [bad], error: null });
      expect((await failure(repo.listThreads(CATEGORY))).kind).toBe('invalid');
    }
    const badPosts = [
      post({ parent_id: 7 }), post({ body: '' }), post({ author_display_name: '' }),
      post({ author_is_admin: 1 }), null,
    ];
    for (const bad of badPosts) {
      rpc.mockResolvedValueOnce({ data: [bad], error: null });
      expect((await failure(repo.list(THREAD))).kind).toBe('invalid');
    }
  });

  it('traduce los rechazos sin filtrar mensajes, tokens ni correos', async () => {
    const secret = 'https://ejemplo.test/rpc?token=secreto&email=alumno@ejemplo.test';
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: secret } });
    expect((await failure(repo.listCategories())).kind).toBe('forbidden');

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX', message: secret } });
    const error = await failure(repo.create(THREAD, 'Hola', null));
    expect(error.kind).toBe('failed');
    expect(JSON.stringify({ message: error.message })).not.toContain('secreto');
    expect(JSON.stringify({ message: error.message })).not.toContain('@');
  });

  it('sin cliente configurado no intenta ninguna RPC', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    const unconfigured = TestBed.inject(ForumThreadRepository);
    expect((await failure(unconfigured.list(THREAD))).kind).toBe('unconfigured');
    expect((await failure(unconfigured.createThread(CATEGORY, 'Título', 'Cuerpo'))).kind).toBe('unconfigured');
    expect(rpc).not.toHaveBeenCalled();
  });
});
