import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS, MESSAGES, MIN_TTL_SECONDS, NOTICE,
  makeHandler, ttlFromEnv, type Dependencies,
} from './handler';
import { createDependencies } from './adapter';

// Clave y GUID sinteticos de prueba: no son secretos reales ni deben usarse fuera de mocks.
const TEST_KEY = 'test_only_synthetic_token_auth_key_0000';
const LIBRARY = '812678';
const LESSON = '30000000-0000-0000-0000-000000000001';
const COURSE = '10000000-0000-0000-0000-000000000001';
const VIDEO = 'abcdef00-1111-2222-3333-444455556666';
const NOW_MS = 1_700_000_000_000;
const ORIGIN = 'http://localhost:4200';

const previewRow = {
  course_id: COURSE,
  preview: true,
  video: { provider: 'bunny', library_id: LIBRARY, video_id: VIDEO, duration_seconds: 10 },
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function setup(options: { authenticated?: boolean; row?: unknown; key?: string | null } = {}) {
  const io: Dependencies = {
    getUser: vi.fn(async (_token: string) => (options.authenticated === false ? null : 'verified-user')),
    video: vi.fn(async (_user: string, _lesson: string) =>
      (options.row === undefined ? previewRow : options.row) as never),
    sign: vi.fn(async (seed: string) => sha256(seed)),
  };
  const config = options.key === undefined
    ? { libraryId: LIBRARY, tokenAuthKey: TEST_KEY }
    : { libraryId: LIBRARY, tokenAuthKey: options.key };
  const handler = makeHandler(io, config, async seed => io.sign(seed), undefined, () => NOW_MS);
  return { io, handler, config };
}

function request(
  body: unknown,
  options: { token?: string | null; method?: string; origin?: string | null } = {},
) {
  const headers: Record<string, string> = {};
  if (options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.token !== null) headers.authorization = `Bearer ${options.token ?? 'jwt-synthetic'}`;
  const method = options.method ?? 'POST';
  return new Request('http://localhost/functions/v1/lesson-video-token', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function native(bodyContent: string, tokenValue: string | null = 'jwt-synthetic') {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (tokenValue !== null) headers.authorization = `Bearer ${tokenValue}`;
  return new Request('http://localhost/functions/v1/lesson-video-token', { method: 'POST', headers, body: bodyContent });
}

describe('lesson video token', () => {
  it('sin Authorization responde 401 sin invocar la RPC', async () => {
    const { io, handler } = setup();
    const response = await handler(request({ lessonId: LESSON }, { token: null }));
    expect(response.status).toBe(401);
    expect(io.getUser).not.toHaveBeenCalled();
    expect(io.video).not.toHaveBeenCalled();
  });

  it('con token invalido responde 401 sin invocar la RPC', async () => {
    const { io, handler } = setup({ authenticated: false });
    const response = await handler(request({ lessonId: LESSON }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: MESSAGES.unauthorized });
    expect(io.getUser).toHaveBeenCalledWith('jwt-synthetic');
    expect(io.video).not.toHaveBeenCalled();
    const basic = new Request('http://localhost', {
      method: 'POST', headers: { origin: ORIGIN, authorization: 'Basic abc' }, body: '{}',
    });
    expect((await handler(basic)).status).toBe(401);
  });

  it('rechaza metodos distintos de POST y OPTIONS', async () => {
    const { io, handler } = setup();
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      expect((await handler(request({ lessonId: LESSON }, { method }))).status).toBe(405);
    }
    expect(io.getUser).not.toHaveBeenCalled();
    expect(io.video).not.toHaveBeenCalled();
  });

  it('rechaza cuerpo invalido antes de Supabase', async () => {
    const { io, handler } = setup();
    const invalid: unknown[] = [
      {}, { lessonId: 42 }, { lessonId: 'AAAAAAAA-0000-0000-0000-000000000000' },
      { lessonId: '30000000-0000-0000-0000-00000000000' }, { lessonId: `${LESSON}z` },
      { lessonId: LESSON, extra: 'x' }, { lessonId: LESSON, userId: 'x' },
      { lessonId: LESSON, courseId: COURSE }, ['lessonId'], [LESSON], null, 'lessonId', 42,
    ];
    for (const body of invalid) expect((await handler(request(body))).status).toBe(400);
    const bodies = [
      JSON.stringify({ lessonId: LESSON, pad: 'x'.repeat(2048) }),
      JSON.stringify({ lessonId: LESSON, pad: 'x'.repeat(3000) }),
      '{"lessonId":', '', 'null', '[1]', 'lessonId=1',
    ];
    for (const body of bodies) expect((await handler(native(body))).status).toBe(400);
    expect(io.video).not.toHaveBeenCalled();
  });

  it('sin fila en la RPC responde 403 generico', async () => {
    const { io, handler } = setup({ row: null });
    const response = await handler(request({ lessonId: LESSON }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: MESSAGES.unavailable });
    expect(io.video).toHaveBeenCalledWith('verified-user', LESSON);
    expect(io.sign).not.toHaveBeenCalled();
  });

  it('con video null o GUID invalido responde 403 sin filtrar IDs privados', async () => {
    const { io, handler } = setup({ row: { ...previewRow, video: null } });
    const response = await handler(request({ lessonId: LESSON }));
    expect(response.status).toBe(403);
    const text = await response.text();
    for (const secret of [VIDEO, LIBRARY, COURSE, 'user_id', 'provider_video_id']) expect(text).not.toContain(secret);
    expect(io.sign).not.toHaveBeenCalled();
    const broken = setup({ row: { ...previewRow, video: { ...previewRow.video, video_id: 'not-a-guid' } } });
    const invalid = await broken.handler(request({ lessonId: LESSON }));
    expect(invalid.status).toBe(403);
    expect(await invalid.text()).not.toContain('not-a-guid');
    expect(broken.io.sign).not.toHaveBeenCalled();
  });

  it('exito en vista previa: embedUrl exacto, expiresAt Unix y token SHA-256', async () => {
    const { io, handler } = setup();
    const response = await handler(request({ lessonId: LESSON }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
    const expires = Math.floor(NOW_MS / 1000) + DEFAULT_TTL_SECONDS;
    const token = sha256(TEST_KEY + VIDEO + String(expires));
    expect(await response.json()).toEqual({
      embedUrl: 'https://player.mediadelivery.net/embed/' + LIBRARY + '/' + VIDEO + '?token=' + token + '&expires=' + expires,
      expiresAt: expires,
      notice: NOTICE,
    });
    expect(io.sign.mock.calls[0][0]).toBe(TEST_KEY + VIDEO + String(expires));
  });

  it('usuario con derecho recibe la misma forma cerrada sin campos privados', async () => {
    const { handler } = setup({ row: { ...previewRow, preview: false } });
    const response = await handler(request({ lessonId: LESSON }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['embedUrl', 'expiresAt', 'notice']);
    expect(typeof body.embedUrl).toBe('string');
    expect(Number.isInteger(body.expiresAt)).toBe(true);
    expect(body.notice).toBe(NOTICE);
    const serialized = JSON.stringify(body);
    for (const hidden of ['library_id', 'user_id', 'status', 'preview', 'provider_video_id']) {
      expect(serialized).not.toContain(hidden);
    }
    expect(serialized).not.toContain(TEST_KEY);
  });

  it('sin Origin mantiene la forma y no emite ACAO', async () => {
    const { handler } = setup();
    const response = await handler(request({ lessonId: LESSON }, { origin: null }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
    expect((await response.json()).notice).toBe(NOTICE);
  });

  it('sin library o sin clave responde 503 sin firmar ni tocar datos', async () => {
    const { io, handler } = setup({ key: null });
    const response = await handler(request({ lessonId: LESSON }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(TEST_KEY);
    expect(io.getUser).not.toHaveBeenCalled();
    expect(io.video).not.toHaveBeenCalled();
    expect(io.sign).not.toHaveBeenCalled();
    const badLibrary = makeHandler(io, { libraryId: 'no-numero', tokenAuthKey: TEST_KEY }, async s => io.sign(s));
    expect((await badLibrary(request({ lessonId: LESSON }))).status).toBe(503);
    expect(io.sign).not.toHaveBeenCalled();
    const noKey = makeHandler(io, { libraryId: LIBRARY, tokenAuthKey: null }, async s => io.sign(s));
    expect((await noKey(request({ lessonId: LESSON }))).status).toBe(503);
  });

  it('error inesperado responde 500 generico sin filtrar el mensaje', async () => {
    const { io, handler } = setup();
    io.video.mockRejectedValueOnce(new Error('secreto interno de base de datos'));
    const response = await handler(request({ lessonId: LESSON }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/secreto|interno|base de datos/);
  });

  it('aplica el limite de 2048 bytes al cuerpo recibido', async () => {
    const { handler } = setup();
    const base = JSON.stringify({ lessonId: LESSON });
    expect((await handler(native(base))).status).toBe(200);
    const over = JSON.stringify({ lessonId: LESSON, pad: 'x'.repeat(2048) });
    expect(over.length).toBeGreaterThan(2048);
    expect((await handler(native(over))).status).toBe(400);
  });

  it('mide el limite de 2048 en bytes UTF-8, no en unidades UTF-16', async () => {
    const { io, handler } = setup();
    const encoder = new TextEncoder();
    const bytes = (text: string) => encoder.encode(text).byteLength;
    const LIMIT = 2048;
    // JSON.parse conserva la ultima clave repetida: el relleno vive en la primera
    // `lessonId` (se descarta) y la clave efectiva es un UUID valido. Asi el body
    // sigue siendo JSON valido con una sola clave y solo varia su tamano en bytes.
    const withPad = (pad: string) => `{"lessonId":"${pad}","lessonId":"${LESSON}"}`;
    const fixedLen = withPad('').length;
    const fixedBytes = bytes(withPad(''));

    // Relleno ASCII justo en el limite: aceptado. La fila del mock tiene video,
    // asi que 200 es inequivoco (no 403 por falta de derecho).
    const ascii = withPad('x'.repeat(LIMIT - fixedBytes));
    expect(bytes(ascii)).toBe(LIMIT);
    expect((await handler(native(ascii))).status).toBe(200);
    expect(io.video).toHaveBeenCalledWith('verified-user', LESSON);

    // Multibyte: length <= 2048 pero bytes > 2048. Con conteo UTF-16 este body
    // llegaria a la RPC y devolveria 200; con el contrato real de bytes debe
    // rechazarse con 400 antes de invocar `io.video`.
    const multibyteOver = withPad('ñ'.repeat(LIMIT - fixedLen));
    expect(multibyteOver.length).toBeLessThanOrEqual(LIMIT);
    expect(bytes(multibyteOver)).toBeGreaterThan(LIMIT);
    io.video.mockClear();
    expect((await handler(native(multibyteOver))).status).toBe(400);
    expect(io.video).not.toHaveBeenCalled();

    // Multibyte por debajo de 2048 bytes: pasa el filtro de tamano y llega a la RPC.
    const multibyteUnder = withPad('ñ'.repeat(Math.floor((LIMIT - fixedBytes) / 2) - 10));
    expect(bytes(multibyteUnder)).toBeLessThan(LIMIT);
    expect((await handler(native(multibyteUnder))).status).toBe(200);
    expect(io.video).toHaveBeenCalledWith('verified-user', LESSON);

    // Frontera estricta del codigo (`>`): 2048 bytes entra, 2049 no.
    io.video.mockClear();
    const atLimit = withPad('x'.repeat(LIMIT - fixedBytes));
    expect(bytes(atLimit)).toBe(LIMIT);
    expect((await handler(native(atLimit))).status).toBe(200);
    io.video.mockClear();
    const overLimit = withPad('x'.repeat(LIMIT + 1 - fixedBytes));
    expect(bytes(overLimit)).toBe(LIMIT + 1);
    expect((await handler(native(overLimit))).status).toBe(400);
    expect(io.video).not.toHaveBeenCalled();
  });

  it('lee TTL entre 60 y 1800 segundos y cae al defecto si es invalido', async () => {
    expect(ttlFromEnv(undefined)).toBe(DEFAULT_TTL_SECONDS);
    expect(ttlFromEnv('')).toBe(DEFAULT_TTL_SECONDS);
    expect(ttlFromEnv('abc')).toBe(DEFAULT_TTL_SECONDS);
    expect(ttlFromEnv('1.5')).toBe(DEFAULT_TTL_SECONDS);
    expect(ttlFromEnv('30')).toBe(MIN_TTL_SECONDS);
    expect(ttlFromEnv('900')).toBe(900);
    expect(ttlFromEnv('7200')).toBe(MAX_TTL_SECONDS);
    expect(ttlFromEnv('86400')).toBe(MAX_TTL_SECONDS);
  });

  it('adaptador verifica el JWT en Auth y delega la RPC con el usuario verificado', async () => {
    const getUser = vi.fn(async (_jwt: string) => ({ data: { user: { id: 'verified' } }, error: null }));
    const rpc = vi.fn(async (_name: string, _args: Record<string, string>) => ({ data: previewRow, error: null }));
    const adapter = createDependencies({ auth: { getUser }, rpc });
    expect(await adapter.getUser('jwt')).toBe('verified');
    expect(getUser).toHaveBeenCalledWith('jwt');
    expect(await adapter.video('verified', LESSON)).toBe(previewRow);
    expect(rpc).toHaveBeenCalledWith('server_lesson_video', { p_user_id: 'verified', p_lesson_id: LESSON });
    expect(await adapter.sign('seed')).toBe(sha256('seed'));
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await adapter.getUser('forged')).toBeNull();
  });
});
