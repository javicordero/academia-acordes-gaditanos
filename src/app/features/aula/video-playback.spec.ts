import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  UNAVAILABLE_PLAYBACK,
  VIDEO_DEMO_CONFIG,
  VIDEO_DEMO_ENABLED,
  YouTubeDemoProvider,
  selectPlaybackProvider,
  youtubeId,
} from './video-playback';
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
});
