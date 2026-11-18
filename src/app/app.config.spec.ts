import { TestBed } from '@angular/core/testing';
import { SUPABASE_CONFIG } from '../environments/supabase-config';
import { appConfig } from './app.config';
import {
  VIDEO_PLAYBACK_FLAG,
  VIDEO_PLAYBACK_PROVIDER,
  VideoPlaybackService,
} from './features/aula/video-playback';
import { BunnyStreamPlaybackProvider } from './features/aula/video-playback-bunny';

describe('appConfig: proveedor de reproducción', () => {
  function configure(bunny: boolean): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', videoPlaybackBunny: bunny } },
      ],
    });
  }

  it('registra el proveedor con el flag público desactivado por defecto', () => {
    configure(false);
    expect(TestBed.inject(VIDEO_PLAYBACK_FLAG).bunny).toBe(false);
    expect(TestBed.inject(VIDEO_PLAYBACK_PROVIDER)).toBeDefined();
    expect(TestBed.inject(VideoPlaybackService)).toBeDefined();
  });

  it('respeta el flag público para seleccionar Bunny sin secretos en el cliente', () => {
    configure(true);
    expect(TestBed.inject(VIDEO_PLAYBACK_FLAG).bunny).toBe(true);
    expect(TestBed.inject(VIDEO_PLAYBACK_PROVIDER)).toBeInstanceOf(BunnyStreamPlaybackProvider);
  });
});
