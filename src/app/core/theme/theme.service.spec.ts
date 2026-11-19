import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  THEME_META_COLORS,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  THEME_STORAGE_VERSION,
  ThemeService,
} from './theme.service';

interface StorageStub {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface MemoryStorage extends StorageStub {
  readonly writes: string[];
}

function memoryStorage(seed?: string): MemoryStorage {
  const values = new Map<string, string>();
  if (seed !== undefined) {
    values.set(THEME_STORAGE_KEY, seed);
  }
  const writes: string[] = [];
  return {
    writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
      writes.push(value);
    },
  };
}

function setup(storage: StorageStub | null = memoryStorage()) {
  const root = document.documentElement;
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.appendChild(meta);
  const documentStub = {
    documentElement: root,
    defaultView: storage ? { localStorage: storage } : null,
    querySelector: (selector: string) => document.querySelector(selector),
  } as unknown as Document;

  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: documentStub }],
  });
  return { service: TestBed.inject(ThemeService), meta, root };
}

describe('ThemeService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.documentElement.removeAttribute('data-theme');
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((element) => element.remove());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.documentElement.removeAttribute('data-theme');
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((element) => element.remove());
  });

  it('ofrece seis ids estables con Creador como predeterminado', () => {
    expect(THEME_IDS).toEqual([
      'creator',
      'flamenco',
      'conservatorio',
      'nocturno',
      'contraste',
      'brutalista',
    ]);
    expect(THEME_OPTIONS.map((option) => option.label)).toEqual([
      'Creador',
      'Flamenco editorial',
      'Conservatorio',
      'Nocturno AG',
      'Alto contraste',
      'Brutalista AG',
    ]);
    expect(DEFAULT_THEME_ID).toBe('creator');
  });

  it('empieza en creator y aplica data-theme y meta theme-color', () => {
    const { service, meta, root } = setup();

    expect(service.theme()).toBe(DEFAULT_THEME_ID);
    expect(service.resolvedTheme()).toBe(DEFAULT_THEME_ID);
    expect(root.getAttribute('data-theme')).toBe('creator');
    expect(meta.content).toBe(THEME_META_COLORS['creator']);
  });

  it('setTheme actualiza ambos signals, persiste y aplica el tema', () => {
    const storage = memoryStorage();
    const { service, meta, root } = setup(storage);

    service.setTheme('nocturno');

    expect(service.theme()).toBe('nocturno');
    expect(service.resolvedTheme()).toBe('nocturno');
    expect(JSON.parse(storage.writes[0])).toEqual({
      version: THEME_STORAGE_VERSION,
      theme: 'nocturno',
    });
    expect(root.getAttribute('data-theme')).toBe('nocturno');
    expect(meta.content).toBe(THEME_META_COLORS['nocturno']);
  });

  it('restaura un tema válido guardado al construirse', () => {
    const stored = JSON.stringify({ version: THEME_STORAGE_VERSION, theme: 'flamenco' });
    const { service, root } = setup(memoryStorage(stored));

    expect(service.theme()).toBe('flamenco');
    expect(root.getAttribute('data-theme')).toBe('flamenco');
  });

  it('ignora valores inválidos y recurre a creator', () => {
    const invalid = [
      'no-es-json',
      JSON.stringify({ version: THEME_STORAGE_VERSION + 1, theme: 'nocturno' }),
      JSON.stringify({ version: THEME_STORAGE_VERSION, theme: 'neon' }),
      JSON.stringify({ version: THEME_STORAGE_VERSION }),
      'null',
    ];

    for (const raw of invalid) {
      TestBed.resetTestingModule();
      document.documentElement.removeAttribute('data-theme');
      const { service, root } = setup(memoryStorage(raw));
      expect(service.theme()).toBe(DEFAULT_THEME_ID);
      expect(root.getAttribute('data-theme')).toBe('creator');
    }
  });

  it('funciona sin localStorage y con almacenamiento que lanza', () => {
    const noStorage = setup(null);
    expect(noStorage.service.theme()).toBe('creator');
    expect(() => noStorage.service.setTheme('conservatorio')).not.toThrow();
    expect(noStorage.service.theme()).toBe('conservatorio');
    expect(noStorage.root.getAttribute('data-theme')).toBe('conservatorio');

    TestBed.resetTestingModule();
    const blocked: StorageStub = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const { service } = setup(blocked);
    expect(service.theme()).toBe('creator');
    expect(() => service.setTheme('contraste')).not.toThrow();
    expect(service.theme()).toBe('contraste');
  });

  it('persiste solo versión e id del tema, sin datos personales', () => {
    const storage = memoryStorage();
    const { service } = setup(storage);

    service.setTheme('creator');

    const raw = storage.writes[0];
    expect(JSON.parse(raw)).toEqual({ version: 1, theme: 'creator' });
    expect(raw).not.toMatch(/email|token|user|alumno|@/i);
  });
});
