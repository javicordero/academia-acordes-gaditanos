import { Injectable, InjectionToken, inject, isDevMode } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { videoDemo } from '../../../environments/video-demo.local';

// El futuro adaptador deberá obtener la fuente temporal tras autorización en servidor.
export interface PlaybackSource {
  readonly embedUrl: SafeResourceUrl;
  readonly notice: string;
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

@Injectable({ providedIn: 'root' })
export class YouTubeDemoProvider implements VideoPlaybackProvider {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly config = inject(VIDEO_DEMO_CONFIG);
  private readonly enabled = inject(VIDEO_DEMO_ENABLED);

  sourceForLesson(lessonId: string): PlaybackSource | null {
    if (!this.enabled || !Object.hasOwn(this.config, lessonId)) return null;
    const id = youtubeId(this.config[lessonId]);
    if (!id) return null;
    return {
      embedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube-nocookie.com/embed/${id}`),
      notice: 'Se cargará YouTube, servicio externo; el enlace puede compartirse. No protege contenido de pago.',
    };
  }
}

export const VIDEO_PLAYBACK_PROVIDER = new InjectionToken<VideoPlaybackProvider>(
  'Proveedor de reproducción', { factory: () => inject(YouTubeDemoProvider) },
);

@Injectable({ providedIn: 'root' })
export class VideoPlaybackService {
  private readonly provider = inject(VIDEO_PLAYBACK_PROVIDER);
  sourceForLesson(lessonId: string): PlaybackSource | null | Promise<PlaybackSource | null> {
    return this.provider.sourceForLesson(lessonId);
  }
}
