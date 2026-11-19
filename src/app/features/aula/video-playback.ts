import { Injectable, InjectionToken, inject, isDevMode } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { videoDemo } from '../../../environments/video-demo.local';
// El adaptador importa tipos de este módulo (`import type`), así que no hay
// ciclo de ejecución en runtime al importar aquí su clase.
import { BunnyStreamPlaybackProvider } from './video-playback-bunny';

/**
 * Fuente de reproducción ya autorizada por el proveedor.
 *
 * `expiresAt` es opcional y compatible: va en milisegundos Unix (la unidad de
 * `Date.now()` en el navegador) y solo lo entrega el adaptador Bunny, que lo
 * convierte desde los segundos que responde la firma del servidor. YouTube y
 * los mocks existentes no lo traen.
 */
/** Baja de la suscripción al evento `ended`. Nunca expone URL ni token. */
export type EndedUnsubscribe = () => void;

export interface PlaybackSource {
  readonly embedUrl: SafeResourceUrl;
  readonly notice: string;
  readonly expiresAt?: number;
  /** Solo el adaptador Bunny marca su procedencia; la demo YouTube no. */
  readonly provider?: 'bunny';
  /**
   * Suscripción opcional y segura al evento `ended` del proveedor. Devuelve una
   * función de baja, o `null` si el proveedor no puede verificar el evento.
   * El iframe se identifica por `frameId`; la URL firmada nunca sale de aquí.
   */
  readonly onEnded?: (frameId: string, handler: () => void) => EndedUnsubscribe | null;
}

/** Contrato único para el aula: fuentes sin soporte no inventan ningún evento. */
export function subscribePlaybackEnded(
  source: PlaybackSource | null,
  frameId: string,
  handler: () => void,
): EndedUnsubscribe | null {
  if (!source || typeof source.onEnded !== 'function') return null;
  try {
    return source.onEnded(frameId, handler) ?? null;
  } catch {
    return null;
  }
}

export interface VideoPlaybackProvider {
  sourceForLesson(lessonId: string): PlaybackSource | null | Promise<PlaybackSource | null>;
}

export function youtubeId(value: string): string | null {
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') {
      if (url.search) return null;
      id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})$/)?.[1] ?? null;
    } else if (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') {
      if (url.pathname !== '/watch' || [...url.searchParams.keys()].some(k => k !== 'v') ||
          url.searchParams.getAll('v').length !== 1) return null;
      id = url.searchParams.get('v');
    } else if (url.hostname === 'www.youtube-nocookie.com') {
      if (url.search) return null;
      id = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const VIDEO_DEMO_CONFIG = new InjectionToken<Readonly<Record<string, string>>>(
  'Configuración local de vídeo de prueba', { factory: () => videoDemo },
);
export const VIDEO_DEMO_ENABLED = new InjectionToken<boolean>(
  'Vídeo de prueba en desarrollo', { factory: () => isDevMode() },
);

/*
 * Selección del proveedor por DI (app.config.ts):
 *
 * - El flag público `videoPlaybackBunny` vive en la configuración pública de
 *   Supabase (por defecto `false`) y puede ponerse a `true` en la copia local
 *   ignorada o suministrarse como provider de entorno. Solo indica el proveedor
 *   esperado: los secretos de Bunny viven siempre en servidor.
 * - El adaptador Bunny (`BunnyStreamPlaybackProvider`) NO pide la firma al
 *   construirse: el aula la solicita automáticamente al cargar una lección de
 *   tipo vídeo ya autorizada (sin paso «Ver vídeo»), monta el iframe y solo
 *   reintenta/renueva ante error o caducidad. Nunca reproduce por sí sola: el
 *   alumno pulsa Play en el reproductor del proveedor.
 * - `VIDEO_PLAYBACK_PROVIDER` se resuelve según el modo en `app.config.ts`
 *   (fábrica de abajo), y un registro de entorno puede sobrescribirlo.
 * - En producción no existe respaldo YouTube: sin Bunny, el aula informa de
 *   que la reproducción está pendiente. YouTube solo es maquetación de
 *   desarrollo (`video-demo.local.ts`, ignorado) y no protege contenido de pago.
 */
export const VIDEO_PLAYBACK_FLAG = new InjectionToken<Readonly<{ bunny: boolean }>>(
  'Reproducción de vídeo configurada', { factory: () => ({ bunny: false }) },
);

@Injectable({ providedIn: 'root' })
export class YouTubeDemoProvider implements VideoPlaybackProvider {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly config = inject(VIDEO_DEMO_CONFIG);
  private readonly enabled = inject(VIDEO_DEMO_ENABLED, { optional: true });
  private readonly flag = inject(VIDEO_PLAYBACK_FLAG, { optional: true });

  sourceForLesson(lessonId: string): PlaybackSource | null {
    // Defensa en profundidad: demo solo en desarrollo y solo si se habilita.
    if (!isDevMode() || !(this.enabled ?? isDevMode())) return null;
    if (this.flag?.bunny) return null;
    if (!Object.hasOwn(this.config, lessonId)) return null;
    const id = youtubeId(this.config[lessonId]);
    if (!id) return null;
    return {
      embedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${id}`),
      notice: 'Modo desarrollo: vídeo de maquetación con YouTube (no Bunny). El enlace puede compartirse y no protege contenido de pago.',
    };
  }
}

/** Sin proveedor configurado en producción: estado honesto, nada se carga. */
export const UNAVAILABLE_PLAYBACK: VideoPlaybackProvider = {
  sourceForLesson: () => null,
};

/**
 * Selección por modo. Producción ignora el modo demo: sin Bunny nunca hay
 * YouTube. Desarrollo permite Bunny o la maquetación YouTube local.
 */
export function playbackProviderFactory(bunny: boolean): VideoPlaybackProvider {
  return selectPlaybackProvider(bunny, isDevMode());
}

export function selectPlaybackProvider(bunny: boolean, demo: boolean): VideoPlaybackProvider {
  if (bunny) return inject(BunnyStreamPlaybackProvider);
  if (demo) return inject(YouTubeDemoProvider);
  return UNAVAILABLE_PLAYBACK;
}

export const VIDEO_PLAYBACK_PROVIDER = new InjectionToken<VideoPlaybackProvider>(
  'Proveedor de reproducción',
  // Red de seguridad para TestBeds aislados; la aplicación real lo sobrescribe
  // en app.config.ts con el flag público (por defecto, sin Bunny).
  { factory: () => playbackProviderFactory(false) },
);

@Injectable({ providedIn: 'root' })
export class VideoPlaybackService {
  private readonly provider = inject(VIDEO_PLAYBACK_PROVIDER);

  sourceForLesson(lessonId: string): PlaybackSource | null | Promise<PlaybackSource | null> {
    return this.provider.sourceForLesson(lessonId);
  }

  /** La firma Bunny caduca; este reloj permite al aula avisar y renovar. */
  expiresAt(lessonId: string): number | null | Promise<number | null> {
    if (this.provider instanceof BunnyStreamPlaybackProvider) {
      return this.provider.expiresAt(lessonId);
    }
    return null;
  }
}
