import { Injectable, InjectionToken, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import type { PlaybackSource, VideoPlaybackProvider } from './video-playback';

/**
 * Adaptador de reproducción de Bunny Stream para el aula.
 *
 * Contrato consumido (Edge Function `lesson-video-token`, emitida en servidor):
 * `client.functions.invoke('lesson-video-token', { body: { lessonId } })`.
 * El SDK añade la sesión (JWT) por su cuenta; aquí no se pasa ningún token,
 * clave ni secreto.
 *
 * - 200 `{ embedUrl, expiresAt, notice }`: `embedUrl` es una URL firmada de
 *   `player.mediadelivery.net` con `token` y `expires`; `expiresAt` va en
 *   segundos Unix y debe coincidir con `expires`.
 * - 200 `{ embedUrl, expiresAt: 0, notice, unsigned: true }`: modo DEV sin
 *   firma (flag de servidor explícito). El embed no lleva token ni `expires`;
 *   `expiresAt` se traduce a `null` (sin temporizador) y se muestra el aviso
 *   del servidor. Cualquier otra combinación (0 sin `unsigned`, `unsigned`
 *   con caducidad) se rechaza cerrando el reproductor.
 * - 401 sin sesión · 403 sin derecho o lección no disponible · 400 solicitud
 *   inválida · 405 método no permitido · 503 sin configuración de Bunny.
 * - Fallo de red sin estado HTTP: error genérico recuperable, nunca el aviso
 *   de "reproducción no configurada".
 *
 * No es DRM: el enlace puede compartirse hasta que caduque y no impide grabar
 * la pantalla. El token viaja dentro de la `embedUrl` firmada que se monta en
 * el iframe; el adaptador no lo devuelve por separado ni lo escribe en consola.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH = new RegExp(`^/embed/[0-9]{1,12}/${UUID}$`);
const TOKEN = /^[0-9a-f]{64}$/;
const DIGITS = /^[0-9]+$/;
const SEGUNDOS_A_MS = 1000;
/** Margen mínimo para que la firma siga vigente al montar el iframe. */
const MARGEN_MS = 5_000;
const NOTICE_MAX = 300;
/** Tope razonable para el acceso comprado (el plan no fija caducidad programada). */
const TTL_MAX = 30 * 24 * 3_600 * SEGUNDOS_A_MS;

/** Reloj inyectable para probar la caducidad sin tocar el reloj real. */
export const PLAYBACK_NOW = new InjectionToken<() => number>('PLAYBACK_NOW', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

/** Rechazo de una respuesta que no cumple el contrato: no se carga nada. */
export class PlaybackResponseError extends Error {
  constructor() {
    super('El servidor devolvió una firma de vídeo que no cumple el contrato');
    this.name = 'PlaybackResponseError';
  }
}

/**
 * Fallo de red o respuesta sin estado HTTP: error recuperable, sin exponer el
 * motivo del SDK (puede contener URLs, tokens o detalles internos).
 */
export class PlaybackNetworkError extends Error {
  constructor() {
    super('No se pudo cargar el vídeo. Vuelve a intentarlo.');
    this.name = 'PlaybackNetworkError';
  }
}

/** Respuesta HTTP de error de la Edge Function: mensaje honesto sin detalles internos. */
export class PlaybackHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PlaybackHttpError';
  }
}

/** Mensaje honesto para un estado HTTP conocido y otro genérico para el resto. */
export function playbackHttpMessage(status: number): string {
  switch (status) {
    case 401:
      return 'La sesión no está activa. Inicia sesión y vuelve a intentarlo.';
    case 403:
      return 'Esta lección no está disponible o no tienes derecho a ver el vídeo.';
    case 400:
      return 'El servidor no aceptó la solicitud de vídeo.';
    case 405:
      return 'El servidor no admite esta solicitud de vídeo.';
    case 503:
      return 'La reproducción de vídeo todavía no está configurada en este entorno.';
    default:
      return 'No se pudo preparar el vídeo. Vuelve a intentarlo más tarde.';
  }
}

/** Estado HTTP de un fallo de la Edge Function, sin leer ni exponer su cuerpo. */
export function playbackStatus(error: unknown): number | null {
  const response = (error as { context?: unknown } | null)?.context;
  const status = (response as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' && Number.isInteger(status) ? status : null;
}

export interface PlaybackTicket {
  readonly source: PlaybackSource;
  /** `null` solo en el modo DEV sin firma: no hay caducidad que vigilar. */
  readonly expiresAt: number | null;
}

interface ValidatedBunny {
  readonly embedUrl: string;
  readonly expiresAt: number | null;
  readonly notice: string;
}

/**
 * Valida estrictamente la respuesta 200 antes de confiar en ella.
 * Devuelve `null` ante cualquier desviación: no se lanza nada con contenido de
 * la respuesta (ni URL ni token) para que no acabe en logs por accidente.
 */
export function validatePlaybackPayload(
  data: unknown,
  startedAt: number,
): ValidatedBunny | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { embedUrl, expiresAt, notice, unsigned } = data as Record<string, unknown>;
  if (typeof embedUrl !== 'string' || embedUrl.length > 2_048) return null;
  if (typeof expiresAt !== 'number' || !Number.isInteger(expiresAt)) return null;
  if (typeof notice !== 'string' || notice.trim().length === 0 || notice.length > NOTICE_MAX) return null;
  if (unsigned !== undefined && typeof unsigned !== 'boolean') return null;

  // Solo el modo DEV explícito puede traer `expiresAt: 0` y un embed sin firma.
  if (unsigned === true) {
    if (expiresAt !== 0 || !validEmbedUrl(embedUrl, null)) return null;
    return { embedUrl, expiresAt: null, notice };
  }

  const expiresMs = expiresAt * SEGUNDOS_A_MS;
  if (!Number.isSafeInteger(expiresMs) || expiresMs <= startedAt + MARGEN_MS) return null;
  if (expiresMs - startedAt > TTL_MAX) return null;
  if (!validEmbedUrl(embedUrl, expiresAt)) return null;
  return { embedUrl, expiresAt: expiresMs, notice };
}

function validEmbedUrl(value: string, expiresAt: number | null): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.hostname !== 'player.mediadelivery.net') return false;
  if (url.port !== '') return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.hash !== '') return false;
  if (!PATH.test(url.pathname)) return false;
  // Sin firma no se admite ningún parámetro: no hay token ni expiración.
  if (expiresAt === null) return url.search === '';
  if (url.searchParams.getAll('token').length !== 1) return false;
  if (url.searchParams.getAll('expires').length !== 1) return false;
  const token = url.searchParams.get('token');
  const expires = url.searchParams.get('expires');
  if (typeof token !== 'string' || !TOKEN.test(token) || token === '0'.repeat(64)) return false;
  if (typeof expires !== 'string' || !DIGITS.test(expires)) return false;
  return Number(expires) === expiresAt;
}

@Injectable({ providedIn: 'root' })
export class BunnyStreamPlaybackProvider implements VideoPlaybackProvider {
  readonly id = 'bunny';
  private readonly client = inject(SUPABASE_CLIENT, { optional: true });
  private readonly sanitizer = inject(DomSanitizer);
  private readonly now = inject(PLAYBACK_NOW);

  async sourceForLesson(lessonId: string): Promise<PlaybackSource | null> {
    const ticket = await this.requestTicket(lessonId);
    return ticket ? ticket.source : null;
  }

  /** Caducidad de la firma ya validada, para que el aula pueda avisar/renovar. */
  async expiresAt(lessonId: string): Promise<number | null> {
    const ticket = await this.requestTicket(lessonId);
    return ticket?.expiresAt ?? null;
  }

  /**
   * Pide la firma al servidor cuando el aula carga la lección de vídeo. El aula
   * decide limpiar o renovar el iframe con la caducidad devuelta; el adaptador solo la
   * obtiene y la valida una vez.
   */
  async requestTicket(lessonId: string): Promise<PlaybackTicket | null> {
    if (typeof lessonId !== 'string' || !lessonId || !this.client) return null;
    const startedAt = this.now();
    const { data, error } = await this.client.functions.invoke('lesson-video-token', { body: { lessonId } });
    if (error) {
      const status = playbackStatus(error);
      // Sin estado HTTP no es "no configurado": es un fallo de red y debe
      // ofrecer reintento, nunca el mensaje honesto de proveedor ausente.
      if (status === null) throw new PlaybackNetworkError();
      throw new PlaybackHttpError(status, playbackHttpMessage(status));
    }
    const valid = validatePlaybackPayload(data, startedAt);
    if (!valid) throw new PlaybackResponseError();
    const source: PlaybackSource = {
      embedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(valid.embedUrl),
      notice: valid.notice,
    };
    if (valid.expiresAt === null) return { source, expiresAt: null };
    return {
      source: { ...source, expiresAt: valid.expiresAt },
      expiresAt: valid.expiresAt,
    };
  }
}
