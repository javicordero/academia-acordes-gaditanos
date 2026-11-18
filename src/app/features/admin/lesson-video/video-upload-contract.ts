import { InjectionToken } from '@angular/core';

/**
 * Contrato del Edge Function `video-upload` (implementado en servidor).
 *
 * El cliente solo habla con nuestra Edge Function: el SDK adjunta el JWT de la
 * sesión real. Ninguna clave de Bunny, firma ni URL de reproducción se pide, se
 * guarda o se escribe en consola aquí. La subida de bytes usa exclusivamente el
 * endpoint TUS fijo devuelto en la concesión, validado contra una constante.
 */

export const VIDEO_UPLOAD_FUNCTION = 'video-upload';
/** Endpoint TUS de Bunny. No se acepta ninguna otra URL devuelta por el servidor. */
export const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
const BUNNY_TUS_ORIGIN = new URL(BUNNY_TUS_ENDPOINT).origin;
/** Árbol de recursos TUS: sin `%`, barras invertidas ni segmentos extraños. */
const TUS_RESOURCE_PATH = /^\/tusupload(?:\/[A-Za-z0-9._~-]+)*\/?$/;

export const INVALID_RESUME_MESSAGE =
  'No se ha podido reanudar la subida. No se ha enviado ningún dato; decide cómo continuar.';

/** La URL guardada por tus-js-client no es de confianza: nunca se registra. */
export class InvalidResumeUrlError extends Error {
  constructor() {
    super(INVALID_RESUME_MESSAGE);
    this.name = 'InvalidResumeUrlError';
  }
}

/**
 * Resuelve una URL de reanudación solo si apunta al endpoint TUS oficial. Sin
 * esta comprobación, un valor manipulado en localStorage haría que tus enviara
 * las cabeceras firmadas (AuthorizationSignature) a un dominio ajeno. Acepta
 * tanto una URL absoluta oficial como una referencia relativa al endpoint fijo;
 * devuelve siempre la URL absoluta canónica, o `null` sin registrarla nunca.
 */
export function resolveBunnyTusResumeUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) return null;
  if (/[\u0000-\u0020\u007f]/.test(input)) return null;

  let url: URL;
  try {
    url = new URL(input, `${BUNNY_TUS_ENDPOINT}/`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.origin !== BUNNY_TUS_ORIGIN) return null;
  if (url.hostname !== 'video.bunnycdn.com' || url.host !== 'video.bunnycdn.com') return null;
  if (url.username !== '' || url.password !== '') return null;
  // El protocolo TUS de Bunny no define parámetros de consulta ni fragmentos.
  if (url.search !== '' || url.hash !== '') return null;
  if (!TUS_RESOURCE_PATH.test(url.pathname)) return null;
  return url.toString();
}

/** Tope defensivo sobre los 86400 s del servidor: evita rechazar por latencia de reloj. */
const MAX_GRANT_TTL_SECONDS = 7 * 24 * 3600;
const MAX_NOTICE = 300;
const MAX_SIGNATURE = 512;
const MAX_BYTES_CEILING = 2 * 1024 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIME = /^[a-z0-9.+*-]+\/[a-z0-9.+*-]+$/;

export type UploadState =
  | 'none'
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'blocked';

export interface UploadLimits {
  readonly maxBytes: number;
  readonly allowedMimeTypes: string[];
}

export interface UploadStatus {
  readonly state: UploadState;
  readonly uploadId?: string;
  readonly hasVideo: boolean;
  readonly limits: UploadLimits;
  readonly durationSeconds?: number;
}

export interface UploadGrant {
  readonly uploadId: string;
  readonly endpoint: string;
  readonly libraryId: string;
  readonly videoId: string;
  readonly expiresAt: number;
  readonly signature: string;
  readonly limits: UploadLimits;
}

/** Fallo de red o respuesta sin estado HTTP: mensaje genérico sin detalles internos. */
export class UploadHttpError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'UploadHttpError';
  }
}

/** La respuesta no cumple el contrato: no se confía en ninguno de sus valores. */
export class InvalidUploadResponseError extends Error {
  constructor() {
    super('El servidor devolvió una respuesta de vídeo que no cumple el contrato; no se ha subido nada.');
    this.name = 'InvalidUploadResponseError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validLimits(value: unknown): UploadLimits | null {
  if (!isObject(value)) return null;
  const maxBytes = value['maxBytes'];
  const allowedMimeTypes = value['allowedMimeTypes'];
  if (typeof maxBytes !== 'number' || !Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_BYTES_CEILING) return null;
  if (!Array.isArray(allowedMimeTypes) || allowedMimeTypes.length === 0 || allowedMimeTypes.length > 50) return null;
  if (!allowedMimeTypes.every((m) => typeof m === 'string' && m.length <= 100 && MIME.test(m))) return null;
  return { maxBytes, allowedMimeTypes: [...allowedMimeTypes] };
}

/** Estado HTTP de un fallo de la Edge Function, sin leer ni exponer su cuerpo. */
export function uploadStatusOf(error: unknown): number | null {
  const context = (error as { context?: unknown } | null)?.context;
  const status = (context as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' && Number.isInteger(status) ? status : null;
}

/** Mensaje honesto y acotado, sin incluir nunca el error del SDK ni la respuesta. */
export function uploadHttpMessage(status: number | null): string {
  switch (status) {
    case 400:
      return 'El servidor no aceptó la solicitud de vídeo.';
    case 401:
      return 'La sesión ha caducado. Inicia sesión de nuevo y reanuda la subida.';
    case 403:
      return 'Tu cuenta no tiene permisos de administración para subir vídeos.';
    case 409:
      return 'Ese vídeo ya está asociado; no se ha creado otro.';
    case 423:
      return 'La subida está bloqueada temporalmente. Vuelve a intentarlo.';
    case 429:
      return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';
    case 502:
      return 'El proveedor de vídeo no respondió. Inténtalo de nuevo.';
    case 503:
      return 'El servidor no tiene configurada la biblioteca de vídeo; no se ha subido nada.';
    case null:
      return 'No se pudo conectar con el servidor. Vuelve a intentarlo.';
    default:
      return 'No se pudo completar la operación de vídeo. Vuelve a intentarlo.';
  }
}

export function validateStatus(data: unknown): UploadStatus | null {
  if (!isObject(data)) return null;
  const state = data['state'];
  const hasVideo = data['hasVideo'];
  const uploadId = data['uploadId'];
  const durationSeconds = data['durationSeconds'];
  const notice = data['notice'];
  const states: UploadState[] = ['none', 'pending', 'uploading', 'processing', 'ready', 'failed', 'blocked'];
  if (typeof state !== 'string' || !states.includes(state as UploadState)) return null;
  if (typeof hasVideo !== 'boolean') return null;
  const limits = validLimits(data['limits']);
  if (!limits) return null;
  if (uploadId !== undefined && !(typeof uploadId === 'string' && UUID.test(uploadId))) return null;
  if (durationSeconds !== undefined && !(
    typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) &&
    durationSeconds >= 0 && durationSeconds <= 24 * 3600
  )) return null;
  if (notice !== undefined && !(typeof notice === 'string' && notice.length <= MAX_NOTICE)) return null;

  // El `notice` del servidor se valida pero NO se conserva: podría contener una
  // URL firmada o un token. La UI solo usa los textos fijos de `statusMessage`.
  return {
    state: state as UploadState,
    ...(typeof uploadId === 'string' ? { uploadId } : {}),
    hasVideo,
    limits,
    ...(typeof durationSeconds === 'number' ? { durationSeconds } : {}),
  };
}

/** Textos fijos, sin datos del proveedor: nunca se muestra el `notice` crudo. */
export function statusMessage(status: UploadStatus): string {
  switch (status.state) {
    case 'ready':
      return 'El vídeo está disponible en esta lección.';
    case 'processing':
      return 'Sigue procesándose. Actualiza el estado en unos momentos.';
    case 'failed':
      return 'El proveedor informó de un error en el vídeo. No se ha borrado nada; revisa el estado.';
    case 'blocked':
      return 'El estado requiere revisión; no se ha sobrescrito ningún vídeo.';
    case 'uploading':
      return 'El vídeo se está enviando al proveedor.';
    case 'pending':
      return 'La subida está reservada; todavía no se ha enviado el archivo.';
    case 'none':
      return 'Todavía no hay vídeo asociado a esta lección.';
  }
}

/**
 * Valida la concesión antes de usarla. `endpoint` debe ser exactamente el fijo:
 * una URL distinta se rechaza, sin "validación en cascada" ni confiar en el
 * proveedor que diga el servidor.
 */
export function validateGrant(data: unknown, nowSeconds: number): UploadGrant | null {
  if (!isObject(data)) return null;
  const uploadId = data['uploadId'];
  const endpoint = data['endpoint'];
  const libraryId = data['libraryId'];
  const videoId = data['videoId'];
  const expiresAt = data['expiresAt'];
  const signature = data['signature'];
  if (typeof uploadId !== 'string' || !UUID.test(uploadId)) return null;
  if (endpoint !== BUNNY_TUS_ENDPOINT) return null;
  if (typeof libraryId !== 'string' || !/^[0-9]{1,12}$/.test(libraryId)) return null;
  if (typeof videoId !== 'string' || !UUID.test(videoId)) return null;
  if (typeof expiresAt !== 'number' || !Number.isInteger(expiresAt)) return null;
  if (expiresAt <= nowSeconds || expiresAt > nowSeconds + MAX_GRANT_TTL_SECONDS) return null;
  if (typeof signature !== 'string' || signature.length === 0 || signature.length > MAX_SIGNATURE) return null;
  const limits = validLimits(data['limits']);
  if (!limits) return null;

  return { uploadId, endpoint, libraryId, videoId, expiresAt, signature, limits };
}

/** Identificador de petición estable para la misma lección y el mismo archivo. */
export function stableRequestId(seed: string): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 4; i++) {
    let hash = (0x811c9dc5 ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    const chunk = `${seed}|${i}`;
    for (let j = 0; j < chunk.length; j++) {
      hash ^= chunk.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    for (let b = 0; b < 4; b++) bytes[i * 4 + b] = (hash >>> (b * 8)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** La huella de reanudación nunca cruza lección, vídeo (GUID) ni archivo. */
export function fileSeed(lessonId: string, videoId: string, file: File): string {
  return [lessonId, videoId, file.name, String(file.size), file.type, String(file.lastModified)].join('|');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function fileValidationError(file: File | null, limits: UploadLimits | null): string | null {
  if (!file) return 'Selecciona un archivo de vídeo.';
  if (!limits) return 'Todavía no se han cargado los límites del servidor. Pulsa «Actualizar estado».';
  if (file.size <= 0) return 'El archivo está vacío.';
  if (file.size > limits.maxBytes) return `El archivo supera el tamaño máximo de ${formatBytes(limits.maxBytes)}.`;
  const type = file.type.toLowerCase();
  const allowed = limits.allowedMimeTypes.some((m) => {
    const candidate = m.toLowerCase();
    return candidate === type || (candidate.endsWith('/*') && type.startsWith(candidate.slice(0, -1)));
  });
  if (!allowed) return `El tipo de archivo no está permitido. Usa: ${limits.allowedMimeTypes.join(', ')}.`;
  return null;
}

/** Parámetros de sondeo acotado; inyectables para pruebas rápidas. */
export interface VideoUploadTiming {
  readonly pollIntervalMs: number;
  readonly pollAttempts: number;
  readonly retryDelays: number[];
}

export const VIDEO_UPLOAD_TIMING = new InjectionToken<VideoUploadTiming>('VIDEO_UPLOAD_TIMING', {
  providedIn: 'root',
  factory: () => ({ pollIntervalMs: 5000, pollAttempts: 6, retryDelays: [0, 1000, 2000] }),
});

export const VIDEO_UPLOAD_NOW = new InjectionToken<() => number>('VIDEO_UPLOAD_NOW', {
  providedIn: 'root',
  factory: () => () => Math.floor(Date.now() / 1000),
});
