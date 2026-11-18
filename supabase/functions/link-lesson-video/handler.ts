// Vincula el GUID real de un vídeo de Bunny a una lección. El cliente solo
// envía lessonId y videoId: library, API key, verificación y escritura son
// exclusivamente de servidor. Ninguna clave ni identificador privado se devuelve.

export const DEFAULT_ORIGINS = ['http://localhost:4200'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY_BYTES = 2048;

export type StoredStatus = 'pending' | 'processing' | 'ready';
export type PublicStatus = 'ready' | 'processing';

export interface VideoVerification {
  status: number;
  length: number;
}

export interface LinkOutcome {
  linkage: 'linked' | 'linked_yet';
  status: PublicStatus;
}

export type LinkResult =
  | { kind: 'ok'; value: LinkOutcome }
  | { kind: 'conflict' }
  | { kind: 'denied' };

export interface Dependencies {
  getUser(token: string): Promise<string | null>;
  isAdmin(user: string): Promise<boolean>;
  verifyVideo(videoId: string): Promise<VideoVerification | null>;
  link(
    user: string,
    lessonId: string,
    libraryId: string,
    videoId: string,
    durationSeconds: number | null,
    status: StoredStatus,
  ): Promise<LinkResult>;
}

export interface Config {
  libraryId: string | null;
  configured: boolean;
}

const MESSAGE = {
  config: 'La biblioteca de vídeo no está configurada en el servidor.',
  unauthorized: 'Autenticación necesaria',
  denied: 'Acceso denegado',
  invalid: 'Solicitud inválida',
  method: 'Método no permitido',
  verify: 'No se pudo verificar el vídeo',
  unavailable: 'El vídeo no está disponible para vincular',
  conflict: 'Ese vídeo ya está vinculado a otra lección',
  internal: 'No se pudo completar la operación',
} as const;

function parseBody(raw: string): { lessonId: string; videoId: string } | null {
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('lessonId') || !keys.includes('videoId')) return null;
  if (!Object.prototype.hasOwnProperty.call(record, 'lessonId') ||
      !Object.prototype.hasOwnProperty.call(record, 'videoId')) return null;
  const { lessonId, videoId } = record;
  if (typeof lessonId !== 'string' || !UUID.test(lessonId)) return null;
  if (typeof videoId !== 'string' || !UUID.test(videoId)) return null;
  return { lessonId, videoId };
}

export function makeHandler(
  io: Dependencies,
  config: Config,
  origins: string[] = DEFAULT_ORIGINS,
) {
  const allowed = (origin: string | null) => !!origin && origins.includes(origin);
  const headers = (origin: string | null) => ({
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    ...(allowed(origin) ? { 'Access-Control-Allow-Origin': origin as string } : {}),
  });
  const reply = (status: number, origin: string | null, payload: Record<string, unknown> | null = null) =>
    new Response(payload ? JSON.stringify(payload) : null, {
      status,
      headers: headers(origin),
    });

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') {
      return allowed(origin) ? reply(204, origin) : reply(403, null);
    }
    if (request.method !== 'POST') return reply(405, origin, { error: MESSAGE.method });
    if (origin && !allowed(origin)) return reply(403, null);
    // Fail-closed: sin biblioteca o API key no se toca Auth, Bunny ni la base.
    if (!config.configured || !config.libraryId) return reply(503, origin, { error: MESSAGE.config });

    try {
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
      if (!match) return reply(401, origin, { error: MESSAGE.unauthorized });
      const user = await io.getUser(match[1]);
      if (!user) return reply(401, origin, { error: MESSAGE.unauthorized });
      if (!await io.isAdmin(user)) return reply(403, origin, { error: MESSAGE.denied });

      const body = parseBody(await request.text());
      if (!body) return reply(400, origin, { error: MESSAGE.invalid });

      const verified = await io.verifyVideo(body.videoId);
      if (!verified || !Number.isInteger(verified.status) ||
          typeof verified.length !== 'number' || !Number.isFinite(verified.length)) {
        return reply(502, origin, { error: MESSAGE.verify });
      }
      if (verified.status === 5 || verified.status === 6 || verified.status < 0 || verified.status > 4) {
        return reply(422, origin, { error: MESSAGE.unavailable });
      }
      const durationSeconds = Number.isInteger(verified.length) && verified.length >= 0
        ? verified.length
        : null;
      // Nunca se marca 'ready' sin estado Finished y duración positiva real.
      if (verified.status === 4 && (durationSeconds === null || durationSeconds <= 0)) {
        return reply(422, origin, { error: MESSAGE.unavailable });
      }
      const status: StoredStatus = verified.status === 4
        ? 'ready'
        : verified.status === 0 ? 'pending' : 'processing';

      const result = await io.link(
        user, body.lessonId, config.libraryId, body.videoId, durationSeconds, status,
      );
      if (result.kind === 'denied') return reply(403, origin, { error: MESSAGE.denied });
      if (result.kind === 'conflict') return reply(409, origin, { error: MESSAGE.conflict });
      const { linkage, status: publicStatus } = result.value;
      if ((linkage !== 'linked' && linkage !== 'linked_yet') ||
          (publicStatus !== 'ready' && publicStatus !== 'processing')) {
        return reply(500, origin, { error: MESSAGE.internal });
      }
      // Sin GUID, sin library, sin rutas ni claves: solo el resultado de la operación.
      return reply(200, origin, { linkage, status: publicStatus });
    } catch {
      // Nunca se propaga error.message: puede contener claves o cuerpos del proveedor.
      return reply(500, origin, { error: MESSAGE.internal });
    }
  };
}
