import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  PlaybackSource,
  UNAVAILABLE_PLAYBACK,
  VIDEO_DEMO_CONFIG,
  VIDEO_DEMO_ENABLED,
  VIDEO_PLAYBACK_FLAG,
  YouTubeDemoProvider,
  selectPlaybackProvider,
  subscribePlaybackEnded,
  youtubeId,
} from './video-playback';
import { BUNNY_PLAYERJS_SRC } from './video-playback-bunny';
import { BunnyStreamPlaybackProvider } from './video-playback-bunny';

describe('YouTube de prueba', () => {
  it('acepta únicamente IDs y URLs HTTPS de formatos admitidos', () => {
    const id = 'Abc_123-xyz';
    for (const value of [id, `https://youtu.be/${id}`, `https://youtube.com/watch?v=${id}`,
      `https://www.youtube.com/watch?v=${id}`, `https://www.youtube-nocookie.com/embed/${id}`]) {
      expect(youtubeId(value)).toBe(id);
    }
    for (const value of ['javascript:alert(1)', 'http://youtu.be/Abc_123-xyz',
      'https://youtube.com.evil.test/watch?v=Abc_123-xyz', 'https://youtube.com@evil.test/watch?v=Abc_123-xyz',
      'https://youtu.be/Abc_123-xyz?x=1', 'https://youtube.com/watch?v=Abc_123-xyz&v=Abc_123-xyz',
      'https://www.youtube-nocookie.com/embed/../../evil', 'https://127.0.0.1/', 'corto']) {
      expect(youtubeId(value)).toBeNull();
    }
  });

  it('no proporciona ninguna fuente cuando desarrollo está deshabilitado', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: VIDEO_DEMO_ENABLED, useValue: false },
      { provide: VIDEO_DEMO_CONFIG, useValue: { l: 'Abc_123-xyz' } },
    ] });
    expect(TestBed.inject(YouTubeDemoProvider).sourceForLesson('l')).toBeNull();
  });

  it('exige configuración válida para la lección', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: VIDEO_DEMO_ENABLED, useValue: true },
      { provide: VIDEO_DEMO_CONFIG, useValue: { l: 'Abc_123-xyz', bad: 'https://evil.test/' } },
    ] });
    const provider = TestBed.inject(YouTubeDemoProvider);
    expect(provider.sourceForLesson('l')).not.toBeNull();
    expect(provider.sourceForLesson('otro')).toBeNull();
    expect(provider.sourceForLesson('bad')).toBeNull();
  });

  it('la demo YouTube no ofrece ended ni carga player.js de Bunny', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: VIDEO_DEMO_ENABLED, useValue: true },
      { provide: VIDEO_DEMO_CONFIG, useValue: { l: 'Abc_123-xyz' } },
    ] });
    const source = TestBed.inject(YouTubeDemoProvider).sourceForLesson('l') as PlaybackSource | null;
    expect(source?.provider).toBeUndefined();
    expect(source?.onEnded).toBeUndefined();
    expect(subscribePlaybackEnded(source, 'frame', vi.fn())).toBeNull();
    expect(document.querySelector(`script[src="${BUNNY_PLAYERJS_SRC}"]`)).toBeNull();
  });
});

describe('selección del proveedor de vídeo', () => {
  it('sin Bunny ni demo no carga nada: estado honesto en producción', () => {
    TestBed.resetTestingModule();
    expect(TestBed.runInInjectionContext(() => selectPlaybackProvider(false, false)))
      .toBe(UNAVAILABLE_PLAYBACK);
  });

  it('con el flag de Bunny resuelve el adaptador mediante DI', () => {
    TestBed.resetTestingModule();
    expect(TestBed.runInInjectionContext(() => selectPlaybackProvider(true, false)))
      .toBeInstanceOf(BunnyStreamPlaybackProvider);
  });

  it('con el flag false en desarrollo usa la demo YouTube previa sin llamar a Bunny', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: VIDEO_DEMO_CONFIG, useValue: { l1: 'Abc_123-xyz' } },
      { provide: VIDEO_DEMO_ENABLED, useValue: true },
      { provide: VIDEO_PLAYBACK_FLAG, useValue: { bunny: false } },
    ] });
    const bunnySpy = vi.spyOn(BunnyStreamPlaybackProvider.prototype, 'sourceForLesson');
    try {
      const provider = TestBed.runInInjectionContext(() => selectPlaybackProvider(false, true));
      expect(provider).toBeInstanceOf(YouTubeDemoProvider);
      expect(provider).not.toBeInstanceOf(BunnyStreamPlaybackProvider);

      const source = provider.sourceForLesson('l1') as PlaybackSource | null;
      expect(source).not.toBeNull();
      expect(source!.notice).toContain('YouTube');
      expect(source!.notice).toContain('no Bunny');
      expect(bunnySpy).not.toHaveBeenCalled();
    } finally {
      bunnySpy.mockRestore();
    }
  });
});
