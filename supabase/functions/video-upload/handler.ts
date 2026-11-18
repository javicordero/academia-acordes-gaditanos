// Subida editorial de vídeo: solo administración, solo Bunny, solo servidor.
// El cliente nunca envía claves ni recibe el API key, la signing key de
// reproducción ni URLs de otros vídeos. La firma TUS es un dato temporal
// necesario para reanudar; el GUID y el library son datos privados que aquí se
// entregan únicamente a una sesión de administrador verificada.

export const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
export const DEFAULT_ORIGINS = ['http://localhost:4200'];

/** Límite técnico de salvaguarda, no una política comercial. */
export const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024;
export const MIN_MAX_BYTES = 1024;
export const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
] as const;

/** Bunny exige al menos 3600 s; 86400 s es el techo técnico configurado. */
export const DEFAULT_TTL_SECONDS = 3600;
export const MIN_TTL_SECONDS = 3600;
export const MAX_TTL_SECONDS = 86400;
export const MAX_BODY_BYTES = 8192;

export const NOTICE =
  'La firma es temporal: permite reanudar, pero no amplía la caducidad del recurso en Bunny. No es DRM ni impide grabar la pantalla.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

export type JobState = 'reserved' | 'pending' | 'uploading' | 'processing' | 'ready' | 'failed' | 'blocked';
export type PublicState = 'none' | 'pending' | 'uploading' | 'processing' | 'ready' | 'failed' | 'blocked';
export type ConflictCode =
  | 'active_job'
  | 'ready_exists'
  | 'request_mismatch'
  | 'invalid_lesson'
  | 'invalid_request'
  | 'conflict'
  | 'guid_in_use'
  | 'not_active'
  | 'not_found';

export interface Job {
  uploadId: string;
  requestId: string;
  lessonId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  state: JobState;
  providerVideoId: string | null;
  providerLibraryId: string | null;
  expiresAt: number | null;
  durationSeconds: number | null;
  reviewRequired: boolean;
  createAttempted: boolean;
}

export interface StatusInfo {
  contentType: string;
  hasVideo: boolean;
  durationSeconds: number | null;
  job: Job | null;
}

export interface ProviderVideo {
  status: number;
  length: number;
}

export type StatusResult =
  | { kind: 'ok'; info: StatusInfo }
  | { kind: 'conflict' }
  | { kind: 'denied' };
export type ReserveResult =
  | { kind: 'ok'; created: boolean; job: Job }
  | { kind: 'conflict'; code: ConflictCode }
  | { kind: 'denied' };
export type AttachResult =
  | { kind: 'ok'; job: Job }
  | { kind: 'conflict' }
  | { kind: 'denied' };
export type RefreshResult =
  | { kind: 'ok'; job: Job }
  | { kind: 'conflict' }
  | { kind: 'denied' };
export type SyncResult =
  | { kind: 'ok'; state: PublicState; durationSeconds: number | null }
  | { kind: 'conflict' }
  | { kind: 'denied' };
export type CreateResult = { kind: 'ok'; videoId: string } | { kind: 'ambiguous' };

export interface Dependencies {
  getUser(token: string): Promise<string | null>;
  isAdmin(user: string): Promise<boolean>;
  status(user: string, lessonId: string): Promise<StatusResult>;
  reserve(
    user: string,
    lessonId: string,
    requestId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
    libraryId: string,
  ): Promise<ReserveResult>;
  attach(
    user: string,
    uploadId: string,
    lessonId: string,
    requestId: string,
    libraryId: string,
    videoId: string,
    expiresAt: number,
  ): Promise<AttachResult>;
  refresh(user: string, uploadId: string, lessonId: string, expiresAt: number): Promise<RefreshResult>;
  sync(
    user: string,
    uploadId: string,
    videoId: string,
    providerStatus: number,
    lengthSeconds: number,
  ): Promise<SyncResult>;
  markReview(user: string, uploadId: string, reason: 'create_ambiguous' | 'attach_failed'): Promise<boolean>;
  createVideo(title: string): Promise<CreateResult>;
  videoStatus(videoId: string): Promise<ProviderVideo | null>;
  signUpload(libraryId: string, videoId: string, expiresAt: number): Promise<string>;
}

export interface Config {
  configured: boolean;
  libraryId: string | null;
  maxBytes: number;
  ttlSeconds: number;
}

export type Body =
  | { action: 'status'; lessonId: string; uploadId?: string }
  | { action: 'prepare'; lessonId: string; requestId: string; fileName: string; fileSize: number; mimeType: string }
  | { action: 'refresh'; lessonId: string; uploadId: string };

export const MESSAGES = {
  config: 'La subida de vídeo requiere la configuración del servidor',
  unauthorized: 'Autenticación necesaria',
  denied: 'Acceso denegado',
  invalid: 'Solicitud inválida',
  method: 'Método no permitido',
  conflict: 'Conflicto con una subida existente',
  ready: 'Esa lección ya tiene vídeo',
  provider: 'No se pudo completar la operación con el proveedor',
  internal: 'No se pudo completar la operación',
  review:
    'La creación del objeto fue ambigua: no se ha reintentado ni borrado nada. Revisión manual necesaria.',
  attachReview: 'No se pudo ligar el vídeo sin sobrescribir otro: revisión manual necesaria.',
  refresh: NOTICE,
  failed: 'Bunny informó de un error en el vídeo. No se ha borrado nada; revisa el estado.',
  blocked: 'El estado requiere revisión; no se ha sobrescrito ningún vídeo.',
} as const;

export function maxBytesFromEnv(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^[0-9]{1,12}$/.test(text)) return DEFAULT_MAX_BYTES;
  return Math.min(DEFAULT_MAX_BYTES, Math.max(MIN_MAX_BYTES, Number(text)));
}

export function ttlFromEnv(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^[0-9]{1,6}$/.test(text)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Number(text)));
}

/** Quita caracteres de control y normaliza espacios; rechaza separadores de ruta. */
export function sanitizeFileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 1 || cleaned.length > 120) return null;
  if (/[/\\]/.test(cleaned)) return null;
  return cleaned;
}

function exactKeys(record: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

export function parseBody(raw: string, maxBytes: number): Body | null {
  if (utf8Bytes(raw) > MAX_BODY_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (Object.getPrototypeOf(parsed) !== Object.prototype) return null;
  const body = parsed as Record<string, unknown>;
  const lessonId = body['lessonId'];
  if (typeof lessonId !== 'string' || !UUID.test(lessonId)) return null;

  switch (body['action']) {
    case 'status': {
      if (exactKeys(body, ['action', 'lessonId'])) return { action: 'status', lessonId };
      if (!exactKeys(body, ['action', 'lessonId', 'uploadId'])) return null;
      const uploadId = body['uploadId'];
      if (typeof uploadId !== 'string' || !UUID.test(uploadId)) return null;
      return { action: 'status', lessonId, uploadId };
    }
    case 'prepare': {
      if (!exactKeys(body, ['action', 'fileSize', 'fileName', 'lessonId', 'mimeType', 'requestId'])) {
        return null;
      }
      const requestId = body['requestId'];
      const fileSize = body['fileSize'];
      const mimeType = body['mimeType'];
      const fileName = sanitizeFileName(body['fileName']);
      if (typeof requestId !== 'string' || !UUID.test(requestId)) return null;
      if (!Number.isInteger(fileSize) || (fileSize as number) <= 0 || (fileSize as number) > maxBytes) {
        return null;
      }
      if (typeof mimeType !== 'string' || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
        return null;
      }
      if (fileName === null) return null;
      return {
        action: 'prepare',
        lessonId,
        requestId,
        fileName,
        fileSize: fileSize as number,
        mimeType,
      };
    }
    case 'refresh': {
      if (!exactKeys(body, ['action', 'lessonId', 'uploadId'])) return null;
      const uploadId = body['uploadId'];
      if (typeof uploadId !== 'string' || !UUID.test(uploadId)) return null;
      return { action: 'refresh', lessonId, uploadId };
    }
    default:
      return null;
  }
}

const ACTIVE_JOB_STATES: readonly JobState[] = ['reserved', 'pending', 'uploading', 'processing'];

function publicState(jobState: JobState): PublicState {
  return jobState === 'reserved' ? 'pending' : jobState;
}

export function makeHandler(
  io: Dependencies,
  config: Config,
  origins: string[] = DEFAULT_ORIGINS,
  now = () => Date.now(),
) {
  const libraryOk = typeof config.libraryId === 'string' && /^[0-9]{1,12}$/.test(config.libraryId);
  const library = libraryOk ? config.libraryId as string : null;
  const limits = { maxBytes: config.maxBytes, allowedMimeTypes: [...ALLOWED_MIME_TYPES] };

  const base: Record<string, string> = {
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const cors = (allowedOrigin: string | null) =>
    allowedOrigin ? { ...base, 'Access-Control-Allow-Origin': allowedOrigin } : base;
  const reply = (status: number, value: unknown, allowedOrigin: string | null) =>
    new Response(JSON.stringify(value), { status, headers: cors(allowedOrigin) });
  const fail = (status: number, message: string) => reply(status, { error: message }, null);

  const grant = (job: Job, expiresAt: number, signature: string, notice?: string) => {
    const value: Record<string, unknown> = {
      uploadId: job.uploadId,
      endpoint: TUS_ENDPOINT,
      libraryId: library,
      videoId: job.providerVideoId,
      expiresAt,
      signature,
      limits,
    };
    if (notice) value['notice'] = notice;
    return value;
  };

  const prepare = async (user: string, body: Extract<Body, { action: 'prepare' }>, origin: string | null) => {
    if (!library) return reply(503, { error: MESSAGES.config }, origin);
    const reserved = await io.reserve(
      user, body.lessonId, body.requestId, body.fileName, body.fileSize, body.mimeType, library,
    );
    if (reserved.kind === 'denied') return reply(403, { error: MESSAGES.denied }, origin);
    if (reserved.kind === 'conflict') {
      const message = reserved.code === 'ready_exists' ? MESSAGES.ready
        : reserved.code === 'invalid_request' ? MESSAGES.invalid
        : MESSAGES.conflict;
      const status = reserved.code === 'invalid_request' ? 400 : 409;
      return reply(status, { error: message }, origin);
    }

    let job = reserved.job;
    let expiresAt: number | null = null;
    let signature: string | null = null;

    try {
      if (reserved.created) {
        // La reserva ya marcó create_attempted: si esto falla, NO se reintenta.
        const created = await io.createVideo(body.fileName);
        if (created.kind !== 'ok' || !UUID.test(created.videoId)) {
          await io.markReview(user, job.uploadId, 'create_ambiguous');
          return reply(502, { error: MESSAGES.provider, notice: MESSAGES.review }, origin);
        }
        expiresAt = Math.floor(now() / 1000) + config.ttlSeconds;
        signature = await io.signUpload(library, created.videoId, expiresAt);
        if (!/^[0-9a-f]{64}$/.test(signature)) {
          await io.markReview(user, job.uploadId, 'create_ambiguous');
          return reply(500, { error: MESSAGES.internal, notice: MESSAGES.review }, origin);
        }
        const attached = await io.attach(
          user, job.uploadId, body.lessonId, body.requestId, library, created.videoId, expiresAt,
        );
        if (attached.kind === 'denied') return reply(403, { error: MESSAGES.denied }, origin);
        if (attached.kind === 'conflict') {
          await io.markReview(user, job.uploadId, 'attach_failed');
          return reply(409, { error: MESSAGES.conflict, notice: MESSAGES.attachReview }, origin);
        }
        job = attached.job;
      } else {
        // Replay del mismo requestId: reutiliza el GUID, nunca crea otro objeto.
        if (!job.providerVideoId || !UUID.test(job.providerVideoId)) {
          return reply(409, { error: MESSAGES.conflict, notice: MESSAGES.review }, origin);
        }
        expiresAt = Math.floor(now() / 1000) + config.ttlSeconds;
        signature = await io.signUpload(library, job.providerVideoId, expiresAt);
        if (!/^[0-9a-f]{64}$/.test(signature)) {
          return reply(500, { error: MESSAGES.internal }, origin);
        }
        const attached = await io.attach(
          user, job.uploadId, body.lessonId, body.requestId, library, job.providerVideoId, expiresAt,
        );
        if (attached.kind === 'denied') return reply(403, { error: MESSAGES.denied }, origin);
        if (attached.kind === 'conflict') {
          return reply(409, { error: MESSAGES.conflict, notice: MESSAGES.attachReview }, origin);
        }
        job = attached.job;
      }
    } catch {
      // Puede haberse creado el objeto antes del fallo: marcar, no reintentar.
      try { await io.markReview(user, job.uploadId, 'create_ambiguous'); } catch { /* fail closed */ }
      return reply(500, { error: MESSAGES.internal, notice: MESSAGES.review }, origin);
    }

    if (!job.providerVideoId || expiresAt === null || signature === null) {
      return reply(500, { error: MESSAGES.internal }, origin);
    }
    return reply(200, grant(job, expiresAt, signature), origin);
  };

  const refresh = async (user: string, body: Extract<Body, { action: 'refresh' }>, origin: string | null) => {
    if (!library) return reply(503, { error: MESSAGES.config }, origin);
    const expiresAt = Math.floor(now() / 1000) + config.ttlSeconds;
    const result = await io.refresh(user, body.uploadId, body.lessonId, expiresAt);
    if (result.kind === 'denied') return reply(403, { error: MESSAGES.denied }, origin);
    if (result.kind === 'conflict') return reply(409, { error: MESSAGES.conflict }, origin);
    const job = result.job;
    if (!job.providerVideoId || !UUID.test(job.providerVideoId)) {
      return reply(409, { error: MESSAGES.conflict }, origin);
    }
    const signature = await io.signUpload(library, job.providerVideoId, expiresAt);
    if (!/^[0-9a-f]{64}$/.test(signature)) return reply(500, { error: MESSAGES.internal }, origin);
    return reply(200, grant(job, expiresAt, signature, MESSAGES.refresh), origin);
  };

  const status = async (user: string, body: Extract<Body, { action: 'status' }>, origin: string | null) => {
    const result = await io.status(user, body.lessonId);
    if (result.kind === 'denied') return reply(403, { error: MESSAGES.denied }, origin);
    if (result.kind === 'conflict') return reply(409, { error: MESSAGES.conflict }, origin);
    const info = result.info;
    if (body.uploadId && info.job && info.job.uploadId !== body.uploadId) {
      return reply(409, { error: MESSAGES.conflict }, origin);
    }
    if (info.hasVideo) {
      const value: Record<string, unknown> = { state: 'ready', hasVideo: true, limits };
      if (info.durationSeconds !== null) value['durationSeconds'] = info.durationSeconds;
      return reply(200, value, origin);
    }
    const job = info.job;
    if (!job) return reply(200, { state: 'none', hasVideo: false, limits }, origin);

    let state: PublicState = publicState(job.state);
    let durationSeconds = job.durationSeconds;
    // Solo se consulta Bunny para el job propio con GUID y estado no terminal.
    if (job.providerVideoId && UUID.test(job.providerVideoId) && ACTIVE_JOB_STATES.includes(job.state)) {
      const provider = await io.videoStatus(job.providerVideoId);
      if (!provider || !Number.isInteger(provider.status) || !Number.isFinite(provider.length)) {
        return reply(502, { error: MESSAGES.provider }, origin);
      }
      const synced = await io.sync(
        user, job.uploadId, job.providerVideoId, provider.status, provider.length,
      );
      if (synced.kind === 'denied') return reply(403, { error: MESSAGES.denied }, origin);
      if (synced.kind === 'conflict') return reply(409, { error: MESSAGES.conflict }, origin);
      state = synced.state;
      durationSeconds = synced.durationSeconds;
    }

    const value: Record<string, unknown> = {
      state,
      uploadId: job.uploadId,
      hasVideo: state === 'ready',
      limits,
    };
    if (state === 'ready' && durationSeconds !== null) value['durationSeconds'] = durationSeconds;
    if (state === 'failed') value['notice'] = MESSAGES.failed;
    if (state === 'blocked') value['notice'] = MESSAGES.blocked;
    return reply(200, value, origin);
  };

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
    if (!config.configured || !library) return reply(503, { error: MESSAGES.config }, allowed);

    try {
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
      if (!match) return reply(401, { error: MESSAGES.unauthorized }, allowed);
      const user = await io.getUser(match[1]);
      if (!user) return reply(401, { error: MESSAGES.unauthorized }, allowed);
      // El rol se comprueba en BD antes de leer el cuerpo o tocar el proveedor.
      if (!await io.isAdmin(user)) return reply(403, { error: MESSAGES.denied }, allowed);

      const body = parseBody(await request.text(), config.maxBytes);
      if (!body) return reply(400, { error: MESSAGES.invalid }, allowed);
      switch (body.action) {
        case 'status': return await status(user, body, allowed);
        case 'prepare': return await prepare(user, body, allowed);
        case 'refresh': return await refresh(user, body, allowed);
      }
    } catch {
      // Nunca se propaga error.message: puede contener claves o respuestas del proveedor.
      return reply(500, { error: MESSAGES.internal }, allowed);
    }
  };
}
