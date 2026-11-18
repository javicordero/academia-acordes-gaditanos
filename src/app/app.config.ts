import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { SUPABASE_CONFIG } from '../environments/supabase-config';
import { routes } from './app.routes';
import {
  VIDEO_PLAYBACK_FLAG,
  VIDEO_PLAYBACK_PROVIDER,
  playbackProviderFactory,
} from './features/aula/video-playback';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Flag público: por defecto false; los secretos de Bunny viven en servidor.
    {
      provide: VIDEO_PLAYBACK_FLAG,
      useFactory: () => ({ bunny: inject(SUPABASE_CONFIG).videoPlaybackBunny === true }),
    },
    {
      provide: VIDEO_PLAYBACK_PROVIDER,
      useFactory: () => playbackProviderFactory(inject(VIDEO_PLAYBACK_FLAG).bunny),
    },
  ],
};
