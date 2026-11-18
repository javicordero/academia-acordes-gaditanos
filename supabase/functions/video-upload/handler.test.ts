import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ALLOWED_MIME_TYPES, DEFAULT_MAX_BYTES, DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS,
  MESSAGES, MIN_TTL_SECONDS, TUS_ENDPOINT, makeHandler, maxBytesFromEnv,
  sanitizeFileName, ttlFromEnv,
  type Dependencies, type Job, type ProviderVideo, type StatusInfo,
} from './handler';
import { createDependencies } from './adapter';

// Clave sintética de tests. No es un secreto real y nunca debe salir del mock.
const TEST_KEY = 'test_only_synthetic_bunny_api_key_0000';
const LIBRARY = '812678';
const USER = '00000000-0000-0000-0000-0000000000a1';
const LESSON = '31000000-0000-0000-0000-000000000001';
const OTHER_LESSON = '31000000-0000-0000-0000-000000000002';
const REQUEST = '51000000-0000-4000-8000-000000000001';
const UPLOAD = '61000000-0000-4000-8000-000000000001';
const VIDEO = 'abcdef00-1111-2222-3333-444455556666';
const OTHER_VIDEO = 'abcdef00-1111-2222-3333-444455556667';
const NOW_MS = 1_700_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);
const ORIGIN = 'http://localhost:4200';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const prepareBody = (overrides: Record<string, unknown> = {}) => ({
  action: 'prepare',
  lessonId: LESSON,
  requestId: REQUEST,
  fileName: 'clip de guitarra.mp4',
  fileSize: 1024 * 1024,
  mimeType: 'video/mp4',
  ...overrides,
});

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    uploadId: UPLOAD,
    requestId: REQUEST,
    lessonId: LESSON,
    fileName: 'clip de guitarra.mp4',
    fileSize: 1024 * 1024,
    mimeType: 'video/mp4',
    state: 'pending',
    providerVideoId: VIDEO,
    providerLibraryId: LIBRARY,
    expiresAt: NOW_S + DEFAULT_TTL_SECONDS,
    durationSeconds: null,
    reviewRequired: false,
    createAttempted: true,
    ...overrides,
  };
}

const emptyStatus: StatusInfo = {
  contentType: 'video', hasVideo: false, durationSeconds: null, job: null,
};

type Options = {
  authenticated?: boolean;
  admin?: boolean;
  configured?: boolean;
  statusInfo?: StatusInfo;
  reserve?: Awaited<ReturnType<Dependencies['reserve']>>;
  attach?: Awaited<ReturnType<Dependencies['attach']>>;
  refresh?: Awaited<ReturnType<Dependencies['refresh']>>;
  sync?: Awaited<ReturnType<Dependencies['sync']>>;
  create?: Awaited<ReturnType<Dependencies['createVideo']>>;
  provider?: ProviderVideo | null;
  maxBytes?: number;
  ttlSeconds?: number;
  origins?: string[];
};

function setup(options: Options = {}) {
  const io: Dependencies = {
    getUser: vi.fn(async (_token: string) => options.authenticated === false ? null : USER),
    isAdmin: vi.fn(async (_user: string) => options.admin !== false),
    status: vi.fn(async () => ({ kind: 'ok' as const, info: options.statusInfo ?? emptyStatus })),
    reserve: vi.fn(async () => options.reserve ?? { kind: 'ok' as const, created: true, job: makeJob({ state: 'reserved', providerVideoId: null }) }),
    attach: vi.fn(async () => options.attach ?? { kind: 'ok' as const, job: makeJob() }),
    refresh: vi.fn(async () => options.refresh ?? { kind: 'ok' as const, job: makeJob({ state: 'uploading' }) }),
    sync: vi.fn(async () => options.sync ?? { kind: 'ok' as const, state: 'processing' as const, durationSeconds: null }),
    markReview: vi.fn(async () => true),
    createVideo: vi.fn(async () => options.create ?? { kind: 'ok' as const, videoId: VIDEO }),
    videoStatus: vi.fn(async () => options.provider === undefined ? { status: 2, length: 60 } : options.provider),
    signUpload: vi.fn(async (library: string, video: string, expires: number) =>
      sha256(library + TEST_KEY + String(expires) + video)),
  };
  const handler = makeHandler(io, {
    configured: options.configured !== false,
    libraryId: LIBRARY,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    ttlSeconds: options.ttlSeconds ?? DEFAULT_TTL_SECONDS,
  }, options.origins ?? [ORIGIN], () => NOW_MS);
  return { io, handler };
}

function request(
  body: unknown,
  options: { token?: string | null; method?: string; origin?: string | null; raw?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? 'jwt-synthetic'}`;
  const method = options.method ?? 'POST';
  return new Request('http://localhost/functions/v1/video-upload', {
    method,
    headers,
    body: method === 'POST' ? (options.raw ?? JSON.stringify(body)) : undefined,
  });
}

describe('video-upload: puerta de seguridad', () => {
  it('sin JWT o con JWT inválido responde 401 antes de tocar BD o Bunny', async () => {
    const { io, handler } = setup();
    const missing = await handler(request(prepareBody(), { token: null }));
    expect(missing.status).toBe(401);
    expect(io.getUser).not.toHaveBeenCalled();
    expect(io.isAdmin).not.toHaveBeenCalled();
    expect(io.reserve).not.toHaveBeenCalled();

    const invalid = setup({ authenticated: false });
    const response = await invalid.handler(request(prepareBody()));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: MESSAGES.unauthorized });
    expect(invalid.io.getUser).toHaveBeenCalledWith('jwt-synthetic');
    expect(invalid.io.reserve).not.toHaveBeenCalled();
    expect(invalid.io.createVideo).not.toHaveBeenCalled();

    const basic = new Request('http://localhost', {
      method: 'POST', headers: { origin: ORIGIN, authorization: 'Basic abc' }, body: '{}',
    });
    expect((await handler(basic)).status).toBe(401);
  });

  it('un alumno autenticado es rechazado por rol antes de leer el cuerpo', async () => {
    const { io, handler } = setup({ admin: false });
    const response = await handler(request({}, { raw: '{' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: MESSAGES.denied });
    expect(io.getUser).toHaveBeenCalled();
    expect(io.isAdmin).toHaveBeenCalledWith(USER);
    expect(io.reserve).not.toHaveBeenCalled();
    expect(io.status).not.toHaveBeenCalled();
    expect(io.createVideo).not.toHaveBeenCalled();
  });

  it('origen no permitido se rechaza; CORS refleja solo orígenes de la lista', async () => {
    const { io, handler } = setup();
    const bad = await handler(request(prepareBody(), { origin: 'https://otro.example' }));
    expect(bad.status).toBe(403);
    expect(bad.headers.has('access-control-allow-origin')).toBe(false);
    expect(io.getUser).not.toHaveBeenCalled();

    const preflight = await handler(request(null, { method: 'OPTIONS' }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(preflight.headers.has('access-control-allow-credentials')).toBe(false);
    expect((await handler(request(null, { method: 'OPTIONS', origin: 'https://otro.example' }))).status).toBe(403);
    const noOrigin = await handler(request(prepareBody(), { origin: null }));
    expect(noOrigin.status).toBe(200);
    expect(noOrigin.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('métodos distintos de POST y OPTIONS responden 405', async () => {
    const { io, handler } = setup();
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      expect((await handler(request(prepareBody(), { method }))).status).toBe(405);
    }
    expect(io.getUser).not.toHaveBeenCalled();
  });

  it('sin configuración responde 503 sin tocar Auth ni proveedor', async () => {
    const { io, handler } = setup({ configured: false });
    const response = await handler(request(prepareBody()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(TEST_KEY);
    expect(io.getUser).not.toHaveBeenCalled();
    expect(io.status).not.toHaveBeenCalled();
    expect(io.createVideo).not.toHaveBeenCalled();
  });

  it('cuerpos sobre 8 KiB se rechazan antes de la BD', async () => {
    const { io, handler } = setup();
    const raw = JSON.stringify(prepareBody({ pad: 'x'.repeat(8200) }));
    expect((await handler(request(null, { raw }))).status).toBe(400);
    expect(io.reserve).not.toHaveBeenCalled();
    expect(io.createVideo).not.toHaveBeenCalled();
  });
});

describe('video-upload: prepare', () => {
  it('devuelve solo la grant TUS necesaria, con endpoint y firma SHA-256 correctos', async () => {
    const { io, handler } = setup();
    const response = await handler(request(prepareBody()));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Origin');
    const body = await response.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'endpoint', 'expiresAt', 'libraryId', 'limits', 'signature', 'uploadId', 'videoId',
    ]);
    expect(body.endpoint).toBe(TUS_ENDPOINT);
    expect(TUS_ENDPOINT).toBe('https://video.bunnycdn.com/tusupload');
    expect(body.libraryId).toBe(LIBRARY);
    expect(body.videoId).toBe(VIDEO);
    expect(body.expiresAt).toBe(NOW_S + DEFAULT_TTL_SECONDS);
    expect(body.signature).toBe(sha256(LIBRARY + TEST_KEY + String(body.expiresAt) + VIDEO));
    expect(body.limits).toEqual({ maxBytes: DEFAULT_MAX_BYTES, allowedMimeTypes: [...ALLOWED_MIME_TYPES] });
    expect(io.reserve).toHaveBeenCalledWith(
      USER, LESSON, REQUEST, 'clip de guitarra.mp4', 1024 * 1024, 'video/mp4', LIBRARY,
    );
    expect(io.createVideo).toHaveBeenCalledTimes(1);
    expect(io.createVideo).toHaveBeenCalledWith('clip de guitarra.mp4');
    expect(io.attach).toHaveBeenCalledWith(USER, UPLOAD, LESSON, REQUEST, LIBRARY, VIDEO, body.expiresAt);
    const serialized = JSON.stringify(body);
    for (const secret of [TEST_KEY, 'apiKey', 'signing', 'AccessKey', 'playback']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('replay del mismo request reutiliza el GUID y no crea segundo objeto', async () => {
    const { io, handler } = setup({
      reserve: { kind: 'ok', created: false, job: makeJob({ state: 'uploading' }) },
    });
    const response = await handler(request(prepareBody()));
    expect(response.status).toBe(200);
    expect((await response.json() as { videoId: string }).videoId).toBe(VIDEO);
    expect(io.createVideo).not.toHaveBeenCalled();
    expect(io.attach).toHaveBeenCalledWith(
      USER, UPLOAD, LESSON, REQUEST, LIBRARY, VIDEO, NOW_S + DEFAULT_TTL_SECONDS,
    );
  });

  it('replay sin GUID ni creación confirmada responde 409 sin reintentar', async () => {
    const { io, handler } = setup({
      reserve: { kind: 'ok', created: false, job: makeJob({ state: 'reserved', providerVideoId: null }) },
    });
    const response = await handler(request(prepareBody()));
    expect(response.status).toBe(409);
    expect(io.createVideo).not.toHaveBeenCalled();
    expect(io.signUpload).not.toHaveBeenCalled();
    expect((await response.json() as { notice?: string }).notice).toBe(MESSAGES.review);
  });

  it('conflictos de reserva impiden cualquier creación en Bunny', async () => {
    const cases: Array<[Awaited<ReturnType<Dependencies['reserve']>>, number]> = [
      [{ kind: 'conflict', code: 'active_job' }, 409],
      [{ kind: 'conflict', code: 'ready_exists' }, 409],
      [{ kind: 'conflict', code: 'request_mismatch' }, 409],
      [{ kind: 'conflict', code: 'invalid_lesson' }, 409],
      [{ kind: 'conflict', code: 'invalid_request' }, 400],
      [{ kind: 'denied' }, 403],
    ];
    for (const [reserve, status] of cases) {
      const { io, handler } = setup({ reserve });
      const response = await handler(request(prepareBody()));
      expect(response.status).toBe(status);
      expect(io.createVideo).not.toHaveBeenCalled();
      expect(io.attach).not.toHaveBeenCalled();
    }
    const ready = setup({ reserve: { kind: 'conflict', code: 'ready_exists' } });
    expect((await (await ready.handler(request(prepareBody()))).json()).error).toBe(MESSAGES.ready);
  });

  it('creación ambigua marca revisión, no reintenta y no filtra el error', async () => {
    const { io, handler } = setup({ create: { kind: 'ambiguous' } });
    const response = await handler(request(prepareBody()));
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: MESSAGES.provider, notice: MESSAGES.review });
    expect(io.createVideo).toHaveBeenCalledTimes(1);
    expect(io.markReview).toHaveBeenCalledWith(USER, UPLOAD, 'create_ambiguous');
    expect(io.attach).not.toHaveBeenCalled();
    expect(io.signUpload).not.toHaveBeenCalled();
    expect(text).not.toContain(TEST_KEY);
  });

  it('un fallo inesperado tras la reserva marca revisión sin reintentar create', async () => {
    const { io, handler } = setup();
    io.createVideo.mockRejectedValueOnce(new Error(`secreto ${TEST_KEY}`));
    const response = await handler(request(prepareBody()));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(TEST_KEY);
    expect(io.createVideo).toHaveBeenCalledTimes(1);
    expect(io.markReview).toHaveBeenCalledWith(USER, UPLOAD, 'create_ambiguous');
  });

  it('attach en conflicto marca revisión y no devuelve la grant', async () => {
    const { io, handler } = setup({ attach: { kind: 'conflict' } });
    const response = await handler(request(prepareBody()));
    expect(response.status).toBe(409);
    expect(io.markReview).toHaveBeenCalledWith(USER, UPLOAD, 'attach_failed');
    expect(await response.text()).not.toContain('signature');
  });

  it('valida UUID, acción, claves, MIME, tamaño y nombre antes de la BD', async () => {
    const invalid: unknown[] = [
      {}, [], null, 'prepare', 42,
      { ...prepareBody(), action: 'status' },
      { ...prepareBody(), extra: 'x' },
      { ...prepareBody(), lessonId: undefined },
      { ...prepareBody(), lessonId: 'AAAAAAAA-0000-0000-0000-000000000001' },
      { ...prepareBody(), lessonId: 'not-a-uuid' },
      { ...prepareBody(), requestId: 'bad' },
      { ...prepareBody(), requestId: undefined },
      { ...prepareBody(), fileSize: 0 },
      { ...prepareBody(), fileSize: -1 },
      { ...prepareBody(), fileSize: 1024.5 },
      { ...prepareBody(), fileSize: '1024' },
      { ...prepareBody(), fileSize: DEFAULT_MAX_BYTES + 1 },
      { ...prepareBody(), mimeType: 'application/pdf' },
      { ...prepareBody(), mimeType: undefined },
      { ...prepareBody(), fileName: '' },
      { ...prepareBody(), fileName: '../clip.mp4' },
      { ...prepareBody(), fileName: 'carpeta\\clip.mp4' },
      { ...prepareBody(), fileName: '\u0000\u0001' },
      { ...prepareBody(), fileName: 'x'.repeat(121) },
      { ...prepareBody(), fileName: 123 },
    ];
    const { io, handler } = setup();
    for (const body of invalid) {
      const response = await handler(request(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(io.isAdmin).toHaveBeenCalled();
    expect(io.reserve).not.toHaveBeenCalled();
    expect(io.createVideo).not.toHaveBeenCalled();
  });

  it('respeta el límite de tamaño configurado en las respuestas y validación', async () => {
    const { io, handler } = setup({ maxBytes: 2048 });
    const ok = await handler(request(prepareBody({ fileSize: 2048 })));
    expect(ok.status).toBe(200);
    expect((await ok.json() as { limits: { maxBytes: number } }).limits.maxBytes).toBe(2048);
    const big = await handler(request(prepareBody({ fileSize: 2049 })));
    expect(big.status).toBe(400);
    expect(io.reserve).toHaveBeenCalledTimes(1);
  });

  it('sanitiza nombres y aplica topes técnicos de configuración', () => {
    expect(sanitizeFileName('  clip   uno.mp4 ')).toBe('clip uno.mp4');
    expect(sanitizeFileName('cli\u0001p.mp4')).toBe('clip.mp4');
    expect(sanitizeFileName('../x.mp4')).toBeNull();
    expect(sanitizeFileName('a\\b.mp4')).toBeNull();
    expect(sanitizeFileName('x'.repeat(121))).toBeNull();
    expect(sanitizeFileName(123)).toBeNull();

    expect(maxBytesFromEnv(undefined)).toBe(DEFAULT_MAX_BYTES);
    expect(maxBytesFromEnv('abc')).toBe(DEFAULT_MAX_BYTES);
    expect(maxBytesFromEnv('1')).toBe(1024);
    expect(maxBytesFromEnv('1048576')).toBe(1048576);
    expect(maxBytesFromEnv('99999999999999')).toBe(DEFAULT_MAX_BYTES);
    expect(ttlFromEnv(undefined)).toBe(DEFAULT_TTL_SECONDS);
    expect(ttlFromEnv('60')).toBe(MIN_TTL_SECONDS);
    expect(ttlFromEnv('7200')).toBe(7200);
    expect(ttlFromEnv('999999')).toBe(MAX_TTL_SECONDS);
  });
});

describe('video-upload: refresh', () => {
  const body = { action: 'refresh', lessonId: LESSON, uploadId: UPLOAD };

  it('re-firma el MISMO GUID sin crear objeto y avisa de la caducidad del recurso', async () => {
    const { io, handler } = setup();
    const response = await handler(request(body));
    expect(response.status).toBe(200);
    const value = await response.json() as Record<string, unknown>;
    expect(value.videoId).toBe(VIDEO);
    expect(value.endpoint).toBe(TUS_ENDPOINT);
    expect(value.expiresAt).toBe(NOW_S + DEFAULT_TTL_SECONDS);
    expect(value.signature).toBe(sha256(LIBRARY + TEST_KEY + String(value.expiresAt) + VIDEO));
    expect(value.notice).toBe(MESSAGES.refresh);
    expect(io.createVideo).not.toHaveBeenCalled();
    expect(io.refresh).toHaveBeenCalledWith(USER, UPLOAD, LESSON, NOW_S + DEFAULT_TTL_SECONDS);
    expect(io.attach).not.toHaveBeenCalled();
  });

  it('un job ajeno o ya listo se rechaza sin firmar', async () => {
    const { io, handler } = setup({
      refresh: { kind: 'conflict' },
    });
    expect((await handler(request(body))).status).toBe(409);
    expect(io.signUpload).not.toHaveBeenCalled();
    const denied = setup({ refresh: { kind: 'denied' } });
    expect((await denied.handler(request(body))).status).toBe(403);
    expect(denied.io.signUpload).not.toHaveBeenCalled();
  });

  it('cuerpo de refresh inválido se rechaza antes de la RPC', async () => {
    const { io, handler } = setup();
    for (const invalid of [
      { ...body, lessonId: 'NOT-A-UUID' },
      { ...body, uploadId: 'bad' },
      { ...body, requestId: REQUEST },
      { action: 'refresh', lessonId: LESSON },
    ]) {
      expect((await handler(request(invalid))).status).toBe(400);
    }
    expect(io.refresh).not.toHaveBeenCalled();
  });
});

describe('video-upload: status', () => {
  const body = { action: 'status', lessonId: LESSON };

  it('sin trabajo responde none sin consultar Bunny', async () => {
    const { io, handler } = setup();
    const response = await handler(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: 'none', hasVideo: false,
      limits: { maxBytes: DEFAULT_MAX_BYTES, allowedMimeTypes: [...ALLOWED_MIME_TYPES] },
    });
    expect(io.videoStatus).not.toHaveBeenCalled();
    expect(io.sync).not.toHaveBeenCalled();
  });

  it('con vídeo listo responde ready sin GUID, sin firma y sin Bunny', async () => {
    const { io, handler } = setup({
      statusInfo: { contentType: 'video', hasVideo: true, durationSeconds: 112, job: makeJob({ state: 'ready' }) },
    });
    const response = await handler(request(body));
    expect(response.status).toBe(200);
    const value = await response.json() as Record<string, unknown>;
    expect(Object.keys(value).sort()).toEqual(['durationSeconds', 'hasVideo', 'limits', 'state']);
    expect(value.state).toBe('ready');
    expect(value.hasVideo).toBe(true);
    expect(value.durationSeconds).toBe(112);
    const serialized = JSON.stringify(value);
    for (const hidden of [VIDEO, UPLOAD, LIBRARY, TEST_KEY, 'providerVideoId']) {
      expect(serialized).not.toContain(hidden);
    }
    expect(io.videoStatus).not.toHaveBeenCalled();
    expect(io.sync).not.toHaveBeenCalled();
    expect(io.signUpload).not.toHaveBeenCalled();
  });

  it('con job activo consulta Bunny solo por su GUID y aplica el estado oficial', async () => {
    const { io, handler } = setup({
      statusInfo: { ...emptyStatus, job: makeJob() },
      provider: { status: 4, length: 90 },
      sync: { kind: 'ok', state: 'ready', durationSeconds: 90 },
    });
    const response = await handler(request(body));
    expect(response.status).toBe(200);
    const value = await response.json() as Record<string, unknown>;
    expect(value.state).toBe('ready');
    expect(value.hasVideo).toBe(true);
    expect(value.durationSeconds).toBe(90);
    expect(io.videoStatus).toHaveBeenCalledWith(VIDEO);
    expect(io.sync).toHaveBeenCalledWith(USER, UPLOAD, VIDEO, 4, 90);
    expect(JSON.stringify(value)).not.toContain(VIDEO);
  });

  it('100% de bytes no es ready: respeta el estado devuelto por sync', async () => {
    const { io, handler } = setup({
      statusInfo: { ...emptyStatus, job: makeJob() },
      provider: { status: 1, length: 300 },
      sync: { kind: 'ok', state: 'processing', durationSeconds: null },
    });
    const value = await (await handler(request(body))).json() as Record<string, unknown>;
    expect(value.state).toBe('processing');
    expect(value.hasVideo).toBe(false);
    expect(value).not.toHaveProperty('durationSeconds');
    expect(io.sync).toHaveBeenCalledWith(USER, UPLOAD, VIDEO, 1, 300);
  });

  it('Finished sin duración real queda en revisión, nunca ready por metadata', async () => {
    const { io, handler } = setup({
      statusInfo: { ...emptyStatus, job: makeJob() },
      provider: { status: 4, length: 0 },
      sync: { kind: 'ok', state: 'blocked', durationSeconds: null },
    });
    const response = await handler(request(body));
    const value = await response.json() as Record<string, unknown>;
    expect(value.state).toBe('blocked');
    expect(value.hasVideo).toBe(false);
    expect(value.notice).toBe(MESSAGES.blocked);
    expect(io.sync).toHaveBeenCalledWith(USER, UPLOAD, VIDEO, 4, 0);
  });

  it('fallo del proveedor responde 502 genérico sin sync ni secretos', async () => {
    const { io, handler } = setup({ statusInfo: { ...emptyStatus, job: makeJob() }, provider: null });
    const response = await handler(request(body));
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: MESSAGES.provider });
    expect(io.sync).not.toHaveBeenCalled();
    expect(text).not.toContain(TEST_KEY);
  });

  it('un uploadId de otra lección no consulta Bunny', async () => {
    const { io, handler } = setup({
      statusInfo: { ...emptyStatus, job: makeJob() },
    });
    const response = await handler(request({ ...body, uploadId: OTHER_VIDEO }));
    expect(response.status).toBe(409);
    expect(io.videoStatus).not.toHaveBeenCalled();
  });

  it('status de una lección no vídeo no crea nada', async () => {
    const { io, handler } = setup({
      statusInfo: { contentType: 'pdf', hasVideo: false, durationSeconds: null, job: null },
    });
    expect((await handler(request(body))).status).toBe(200);
    expect(io.reserve).not.toHaveBeenCalled();
    expect(io.createVideo).not.toHaveBeenCalled();
  });
});

describe('video-upload: adaptador (mocks, sin proveedor real)', () => {
  function makeClient() {
    const getUser = vi.fn(async (_jwt: string) => ({ data: { user: { id: USER } }, error: null }));
    const limit = vi.fn(async () => ({ data: [{ user_id: USER }], error: null }));
    const eq2 = vi.fn(() => ({ limit }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const select = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ select }));
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null }));
    return { client: { auth: { getUser }, from, rpc }, getUser, from, rpc, eq1, eq2 };
  }

  it('verifica JWT, rol en user_roles y traduce errores de RPC a conflicto/denegado', async () => {
    const { client, getUser, from, eq2, rpc } = makeClient();
    const deps = createDependencies(client, { libraryId: LIBRARY, apiKey: TEST_KEY });
    expect(await deps.getUser('jwt')).toBe(USER);
    expect(getUser).toHaveBeenCalledWith('jwt');
    expect(await deps.isAdmin(USER)).toBe(true);
    expect(from).toHaveBeenCalledWith('user_roles');
    expect(eq2).toHaveBeenCalledWith('role', 'admin');

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'active_job' } });
    const reserve = await deps.reserve(USER, LESSON, REQUEST, 'clip.mp4', 1024, 'video/mp4', LIBRARY);
    expect(reserve).toEqual({ kind: 'conflict', code: 'active_job' });
    expect(rpc).toHaveBeenCalledWith('video_upload_reserve', expect.objectContaining({
      p_user_id: USER, p_lesson_id: LESSON, p_request_id: REQUEST, p_library_id: LIBRARY,
    }));

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'forbidden' } });
    expect(await deps.refresh(USER, UPLOAD, LESSON, 1800000000)).toEqual({ kind: 'denied' });
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await deps.getUser('forged')).toBeNull();
  });

  it('create usa hostname fijo Bunny, AccessKey solo servidor y no reintenta', async () => {
    const { client } = makeClient();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ guid: VIDEO }), { status: 200 }));
    const deps = createDependencies(client, { libraryId: LIBRARY, apiKey: TEST_KEY, fetchImpl });
    const created = await deps.createVideo('clip.mp4');
    expect(created).toEqual({ kind: 'ok', videoId: VIDEO });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://video.bunnycdn.com/library/${LIBRARY}/videos`);
    expect(new URL(url).hostname).toBe('video.bunnycdn.com');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).AccessKey).toBe(TEST_KEY);
    expect(JSON.parse(init.body as string)).toEqual({ title: 'clip.mp4' });

    fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    expect(await deps.createVideo('clip.mp4')).toEqual({ kind: 'ambiguous' });
    fetchImpl.mockResolvedValueOnce(new Response('{', { status: 200 }));
    expect(await deps.createVideo('clip.mp4')).toEqual({ kind: 'ambiguous' });
    fetchImpl.mockRejectedValueOnce(new Error('red caída'));
    expect(await deps.createVideo('clip.mp4')).toEqual({ kind: 'ambiguous' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('videoStatus usa GET al mismo host y solo acepta estado/duración del proveedor', async () => {
    const { client } = makeClient();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 4, length: 112 }), { status: 200 }));
    const deps = createDependencies(client, { libraryId: LIBRARY, apiKey: TEST_KEY, fetchImpl });
    expect(await deps.videoStatus(VIDEO)).toEqual({ status: 4, length: 112 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://video.bunnycdn.com/library/${LIBRARY}/videos/${VIDEO}`);
    expect(new URL(url).hostname).toBe('video.bunnycdn.com');
    expect((init.headers as Record<string, string>).AccessKey).toBe(TEST_KEY);

    fetchImpl.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await deps.videoStatus(VIDEO)).toBeNull();
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'raro', length: 1 }), { status: 200 }));
    expect(await deps.videoStatus(VIDEO)).toBeNull();
  });

  it('la firma TUS es SHA-256(library + API key + expiry + guid), sin playback key', async () => {
    const { client } = makeClient();
    const deps = createDependencies(client, { libraryId: LIBRARY, apiKey: TEST_KEY });
    const expires = NOW_S + DEFAULT_TTL_SECONDS;
    expect(await deps.signUpload(LIBRARY, VIDEO, expires)).toBe(sha256(LIBRARY + TEST_KEY + String(expires) + VIDEO));
    expect(await deps.signUpload(LIBRARY, VIDEO, expires + 1)).not.toBe(sha256(LIBRARY + TEST_KEY + String(expires) + VIDEO));
  });
});
