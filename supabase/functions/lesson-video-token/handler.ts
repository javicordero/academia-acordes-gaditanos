export const DEFAULT_TTL_SECONDS = 900;
export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 1800;
export const DEFAULT_ORIGINS = ['http://localhost:4200'];

export const NOTICE =
  'Este enlace se puede compartir hasta que caduque. No es DRM ni impide grabar la pantalla.';

/** Aviso honesto del modo DEV sin firma: el enlace no caduca y se puede compartir. */
export const UNSIGNED_NOTICE =
  'Enlace sin caducidad: el control de acceso está desactivado (modo desarrollo). Configura la firma antes de publicar.';

/** Aviso del 503: no revela clave, bandera ni detalle interno alguno. */
export const CONFIG_NOTICE =
  'La reproducción requiere la configuración de Bunny en el servidor; el acceso sin firma está desactivado.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIBRARY = /^[0-9]{1,12}$/;
const MAX_BODY_BYTES = 2048;
const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const EMBED = 'https://player.mediadelivery.net/embed';

export type Config = {
  libraryId: string | null;
  tokenAuthKey: string | null;
  ttlSeconds?: number;
  /** Solo DEV. Con este flag a true y sin signing key se emite un embed sin firma. Por defecto false. */
  allowUnsignedDev?: boolean;
  /** Entorno de despliegue; ausente equivale a 'production' (fail-closed). */
  environment?: string;
};

/** Solo los literales exactos 'development'/'dev' habilitan el modo sin firma. */
export function isDevelopmentEnvironment(value: string | undefined | null): boolean {
  return value === 'development' || value === 'dev';
}

export type VideoRow = {
  course_id: string;
  preview: boolean;
  video: {
    provider: string;
    library_id: string;
    video_id: string;
  } | null;
};

export interface Dependencies {
  getUser(token: string): Promise<string | null>;
  video(user: string, lesson: string): Promise<VideoRow | null>;
  sign(seed: string): Promise<string>;
}

export function ttlFromEnv(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^[0-9]{1,6}$/.test(text)) return DEFAULT_TTL_SECONDS;
  const value = Number(text);
  if (value < MIN_TTL_SECONDS) return MIN_TTL_SECONDS;
  if (value > MAX_TTL_SECONDS) return MAX_TTL_SECONDS;
  return value;
}

export function usableVideo(row: unknown): { libraryId: string; videoId: string } | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.course_id !== 'string' || !UUID.test(r.course_id)) return null;
  if (typeof r.preview !== 'boolean') return null;
  if (!r.video || typeof r.video !== 'object' || Array.isArray(r.video)) return null;
  const v = r.video as Record<string, unknown>;
  if (v.provider !== 'bunny') return null;
  if (typeof v.library_id !== 'string' || !LIBRARY.test(v.library_id)) return null;
  if (typeof v.video_id !== 'string' || !UUID.test(v.video_id)) return null;
  return { libraryId: v.library_id, videoId: v.video_id };
}

export function parseBody(raw: string): string | null {
  if (utf8Bytes(raw) > MAX_BODY_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  if (Object.getPrototypeOf(body) !== Object.prototype) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'lessonId') return null;
  const lesson = (body as { lessonId?: unknown }).lessonId;
  if (typeof lesson !== 'string' || !UUID.test(lesson)) return null;
  return lesson;
}

export const MESSAGES = {
  unauthorized: 'Autenticación necesaria',
  denied: 'Acceso denegado',
  invalid: 'Solicitud inválida',
  unavailable: 'Vídeo no disponible',
  method: 'Método no permitido',
  config: 'Servicio no configurado',
  internal: 'No se pudo completar la operación',
};

export function makeHandler(
  io: Dependencies,
  config: Config,
  sha256Hex: (seed: string) => Promise<string>,
  origins = DEFAULT_ORIGINS,
  now = () => Date.now(),
) {
  const libraryOk = typeof config.libraryId === 'string' && LIBRARY.test(config.libraryId);
  const keyOk = typeof config.tokenAuthKey === 'string' && config.tokenAuthKey.length > 0;
  // Doble condición: flag literal true Y entorno explícitamente de desarrollo.
  // En producción o con el entorno ausente el flag se ignora -> fail-closed 503.
  const allowUnsigned = config.allowUnsignedDev === true && isDevelopmentEnvironment(config.environment);
  const rawTtl = typeof config.ttlSeconds === 'number' && Number.isInteger(config.ttlSeconds)
    ? config.ttlSeconds
    : DEFAULT_TTL_SECONDS;
  const ttl = Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, rawTtl));

  const base: Record<string, string> = {
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };
  // ACAO solo refleja un origen de la lista blanca; nunca wildcard ni credenciales.
  const cors = (allowedOrigin: string | null) =>
    allowedOrigin ? { ...base, 'Access-Control-Allow-Origin': allowedOrigin } : base;
  const reply = (status: number, value: unknown, allowedOrigin: string | null) =>
    new Response(JSON.stringify(value), { status, headers: cors(allowedOrigin) });
  const fail = (status: number, message: string) => reply(status, { error: message }, null);

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const allowed = origin !== null && origins.includes(origin) ? origin : null;
    if (request.method === 'OPTIONS') {
      if (origin !== null && allowed === null) return fail(403, MESSAGES.denied);
      return new Response(null, {
        status: 204,
        headers: {
          ...cors(allowed),
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
          'Access-Control-Max-Age': '600',
        },
      });
    }
    if (request.method !== 'POST') return fail(405, MESSAGES.method);
    if (origin !== null && allowed === null) return fail(403, MESSAGES.denied);
    // Fail-closed: sin biblioteca válida, o sin firma y sin el flag DEV explícito,
    // no se consulta ni se firma nada.
    if (!libraryOk || (!keyOk && !allowUnsigned)) {
      return reply(503, { error: MESSAGES.config, notice: CONFIG_NOTICE }, allowed);
    }

    try {
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
      if (!match) return reply(401, { error: MESSAGES.unauthorized }, allowed);

      const user = await io.getUser(match[1]);
      if (!user) return reply(401, { error: MESSAGES.unauthorized }, allowed);

      const lessonId = parseBody(await request.text());
      if (!lessonId) return reply(400, { error: MESSAGES.invalid }, allowed);

      const media = usableVideo(await io.video(user, lessonId));
      if (!media) return reply(403, { error: MESSAGES.unavailable }, allowed);

      // Modo DEV sin signing key: la sesión y el derecho ya están verificados,
      // pero el embed no lleva token ni expiración. `unsigned` y `expiresAt: 0`
      // permiten al cliente mostrar el aviso sin tratarlo como una firma caducada.
      if (!keyOk) {
        return reply(200, {
          embedUrl: `${EMBED}/${media.libraryId}/${media.videoId}`,
          expiresAt: 0,
          notice: UNSIGNED_NOTICE,
          unsigned: true,
        }, allowed);
      }

      // El token solo existe dentro del embedUrl; nunca se devuelve ni registra aparte.
      const expires = Math.floor(now() / 1000) + ttl;
      const token = await sha256Hex(String(config.tokenAuthKey) + media.videoId + String(expires));
      if (!/^[0-9a-f]{64}$/.test(token)) return reply(500, { error: MESSAGES.internal }, allowed);
      const embedUrl = `${EMBED}/${media.libraryId}/${media.videoId}?token=${token}&expires=${expires}`;
      return reply(200, { embedUrl, expiresAt: expires, notice: NOTICE }, allowed);
    } catch {
      return reply(500, { error: MESSAGES.internal }, allowed);
    }
  };
}
