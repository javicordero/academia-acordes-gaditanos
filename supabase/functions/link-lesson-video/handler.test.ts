import { describe, expect, it, vi } from 'vitest';
import { makeHandler, type Config, type Dependencies, type LinkResult } from './handler';
import { createDependencies } from './adapter';

const lesson = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const video = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherVideo = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const library = '901234';
const apiKey = 'clave-ficticia-de-prueba';

type Harness = {
  io: Dependencies & {
    getUser: ReturnType<typeof vi.fn>;
    isAdmin: ReturnType<typeof vi.fn>;
    verifyVideo: ReturnType<typeof vi.fn>;
    link: ReturnType<typeof vi.fn>;
  };
  config: Config;
  handler: ReturnType<typeof makeHandler>;
};

function setup(overrides: Partial<Config> = {}): Harness {
  const io = {
    getUser: vi.fn(async (_token: string) => 'verified-user'),
    isAdmin: vi.fn(async (_user: string) => true),
    verifyVideo: vi.fn(async (_id: string) => ({ status: 4, length: 112 })),
    link: vi.fn(async (): Promise<LinkResult> => ({ kind: 'ok', value: { linkage: 'linked', status: 'ready' } })),
  };
  const config: Config = { libraryId: library, configured: true, ...overrides };
  return { io, config, handler: makeHandler(io, config) };
}

function request(body: unknown = { lessonId: lesson, videoId: video }, token = 'jwt', origin: string | null = 'http://localhost:4200') {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (origin) headers.origin = origin;
  return new Request('http://localhost/function', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe('link-lesson-video', () => {
  it('verifica en Bunny antes de escribir y devuelve solo linkage/status', async () => {
    const { handler, io } = setup();
    const response = await handler(request());
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ linkage: 'linked', status: 'ready' });
    expect(io.verifyVideo).toHaveBeenCalledWith(video);
    expect(io.link).toHaveBeenCalledWith('verified-user', lesson, library, video, 112, 'ready');
    expect(text).not.toContain(video);
    expect(text).not.toContain(library);
    expect(text).not.toContain(apiKey);
  });

  it('es idempotente y distingue el estado de procesamiento', async () => {
    const { handler, io } = setup();
    io.verifyVideo.mockResolvedValueOnce({ status: 2, length: 0 });
    io.link.mockResolvedValueOnce({ kind: 'ok', value: { linkage: 'linked_yet', status: 'processing' } });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ linkage: 'linked_yet', status: 'processing' });
    expect(io.link).toHaveBeenCalledWith('verified-user', lesson, library, video, 0, 'processing');
    io.verifyVideo.mockResolvedValueOnce({ status: 0, length: null });
    expect((await handler(request())).status).toBe(502);
  });

  it('no marca ready sin Finished y duración positiva; rechaza estados de error', async () => {
    const { handler, io } = setup();
    io.verifyVideo.mockResolvedValueOnce({ status: 4, length: 0 });
    expect((await handler(request())).status).toBe(422);
    io.verifyVideo.mockResolvedValueOnce({ status: 5, length: 100 });
    expect((await handler(request())).status).toBe(422);
    io.verifyVideo.mockResolvedValueOnce({ status: 6, length: 100 });
    expect((await handler(request())).status).toBe(422);
    io.verifyVideo.mockResolvedValueOnce({ status: 99, length: 100 });
    expect((await handler(request())).status).toBe(422);
    expect(io.link).not.toHaveBeenCalled();
  });

  it('falla cerrado sin configuración antes de tocar Auth, Bunny o la base', async () => {
    const { io, handler } = setup({ configured: false });
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ error: 'La biblioteca de vídeo no está configurada en el servidor.' });
    expect(io.getUser).not.toHaveBeenCalled();
    expect(io.verifyVideo).not.toHaveBeenCalled();
    expect(io.link).not.toHaveBeenCalled();
  });

  it('exige JWT verificado y rol admin real, jamás metadatos', async () => {
    const { io, handler } = setup();
    io.getUser.mockResolvedValueOnce(null);
    expect((await handler(request({}, 'jwt-user_metadata-admin'))).status).toBe(401);
    io.isAdmin.mockResolvedValueOnce(false);
    const denied = await handler(request({}, 'jwt-user_metadata-admin'));
    expect(denied.status).toBe(403);
    expect(await json(denied)).toEqual({ error: 'Acceso denegado' });
    expect(io.verifyVideo).not.toHaveBeenCalled();
    expect(io.link).not.toHaveBeenCalled();
  });

  it('devuelve 409 cuando el vídeo pertenece a otra lección y 403 si la RPC deniega', async () => {
    const { io, handler } = setup();
    io.link.mockResolvedValueOnce({ kind: 'conflict' });
    const conflict = await handler(request());
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toEqual({ error: 'Ese vídeo ya está vinculado a otra lección' });
    io.link.mockResolvedValueOnce({ kind: 'denied' });
    expect((await handler(request())).status).toBe(403);
  });

  it('traduce fallos de verificación y errores internos sin volcar mensajes', async () => {
    const { io, handler } = setup();
    io.verifyVideo.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error(`fallo con ${apiKey} y ${library}`));
    const failed = await handler(request());
    expect(failed.status).toBe(502);
    expect(await json(failed)).toEqual({ error: 'No se pudo verificar el vídeo' });
    const crashed = await handler(request());
    expect(crashed.status).toBe(500);
    const text = await crashed.text();
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain(library);
    expect(text).not.toContain('fallo');
    expect(io.link).not.toHaveBeenCalled();
  });

  it('rechaza datos de entrada inválidos, incluidos extras y UUID en mayúsculas', async () => {
    const { io, handler } = setup();
    const invalid: unknown[] = [
      { lessonId: lesson },
      { videoId: video },
      { lessonId: lesson, videoId: video, role: 'admin' },
      { lessonId: lesson, videoId: otherVideo, courseId: lesson },
      { lessonId: lesson.toUpperCase(), videoId: video },
      { lessonId: lesson, videoId: video.toUpperCase() },
      { lessonId: 1, videoId: video },
      { lessonId: lesson, videoId: null },
      [],
      null,
      'texto',
      `{"lessonId":"${lesson}","videoId":"${video}"`,
      `{"lessonId":"${lesson}","videoId":"${video}"}${' '.repeat(2048)}`,
    ];
    for (const body of invalid) expect((await handler(request(body))).status).toBe(400);
    expect(io.getUser).toHaveBeenCalledTimes(invalid.length);
    expect(io.verifyVideo).not.toHaveBeenCalled();
  });

  it('gestiona CORS sin wildcard ni credenciales y responde al preflight', async () => {
    const { handler } = setup();
    const denied = await handler(request({}, 'jwt', 'https://evil.example'));
    expect(denied.status).toBe(403);
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
    expect(denied.headers.has('access-control-allow-credentials')).toBe(false);
    const preflight = await handler(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'http://localhost:4200' } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:4200');
    expect(preflight.headers.get('vary')).toBe('Origin');
    expect(preflight.headers.get('cache-control')).toBe('no-store');
    expect((await handler(new Request('http://localhost', { method: 'GET' }))).status).toBe(405);
    expect((await handler(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }))).status).toBe(403);
  });

  it('acepta orígenes adicionales configurados por entorno', async () => {
    const { io } = setup();
    const handler = makeHandler(io, { libraryId: library, configured: true }, ['http://localhost:4200', 'https://admin.example']);
    const response = await handler(request({ lessonId: lesson, videoId: video }, 'jwt', 'https://admin.example'));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://admin.example');
  });
});

describe('adaptador link-lesson-video', () => {
  function adapterHarness() {
    let adminRows: unknown[] = [{ user_id: 'verified-user' }];
    const getUser = vi.fn(async (_token: string) => ({ data: { user: { id: 'verified-user' } }, error: null }));
    const limit = vi.fn(async (_count: number) => ({ data: adminRows, error: null }));
    const eqRole = vi.fn((_column: string, _value: string) => ({ limit }));
    const eq = vi.fn((_column: string, _value: string) => ({ eq: eqRole }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn((_table: string) => ({ select }));
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
      data: { linkage: 'linked', status: 'ready' },
      error: null,
    }));
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ status: 4, length: 112 }), { status: 200 }));
    const deps = createDependencies(
      { auth: { getUser }, from, rpc },
      { libraryId: library, apiKey, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    return {
      deps, getUser, eq, eqRole, limit, select, from, rpc, fetchImpl,
      setAdminRows(rows: unknown[]) { adminRows = rows; },
    };
  }

  it('consulta Bunny con AccessKey y delega la escritura en la RPC con library del entorno', async () => {
    const { deps, getUser, from, rpc, fetchImpl, eqRole, limit } = adapterHarness();
    expect(await deps.getUser('jwt')).toBe('verified-user');
    expect(getUser).toHaveBeenCalledWith('jwt');
    expect(await deps.isAdmin('verified-user')).toBe(true);
    expect(from).toHaveBeenCalledWith('user_roles');
    expect(eqRole).toHaveBeenCalledWith('role', 'admin');
    expect(limit).toHaveBeenCalledWith(1);
    expect(await deps.verifyVideo(video)).toEqual({ status: 4, length: 112 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://video.bunnycdn.com/library/${library}/videos/${video}`);
    expect(init).toEqual({ headers: { AccessKey: apiKey } });
    const result = await deps.link('verified-user', lesson, library, video, 112, 'ready');
    expect(rpc).toHaveBeenCalledWith('server_link_lesson_video', {
      p_user_id: 'verified-user', p_lesson_id: lesson, p_provider_library_id: library,
      p_video_id: video, p_duration_seconds: 112, p_status: 'ready',
    });
    expect(result).toEqual({ kind: 'ok', value: { linkage: 'linked', status: 'ready' } });
  });

  it('no admin, conflict y respuesta inesperada se reducen a resultados sin mensajes', async () => {
    const { deps, setAdminRows } = adapterHarness();
    setAdminRows([]);
    expect(await deps.isAdmin('verified-user')).toBe(false);
    const { deps: second, rpc } = adapterHarness();
    rpc.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('conflict'), { code: 'P0001' }) });
    expect(await second.link('u', lesson, library, video, 1, 'ready')).toEqual({ kind: 'conflict' });
    rpc.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('forbidden'), { code: '42501' }) });
    expect(await second.link('u', lesson, library, video, 1, 'ready')).toEqual({ kind: 'denied' });
    rpc.mockResolvedValueOnce({ data: { linkage: 'linked', status: 'ready', provider_video_id: video }, error: null });
    expect(await second.link('u', lesson, library, video, 1, 'ready')).toEqual({
      kind: 'ok', value: { linkage: 'linked', status: 'ready' },
    });
  });

  it('una respuesta HTTP fallida o un cuerpo inválido de Bunny no se guarda', async () => {
    const { deps, fetchImpl } = adapterHarness();
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect(await deps.verifyVideo(video)).toBeNull();
    fetchImpl.mockResolvedValueOnce(new Response('{"status":4,"length":"112"}', { status: 200 }));
    expect(await deps.verifyVideo(video)).toBeNull();
  });
});
