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
  isThemeId,
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
  if (seed !== undefined) values.set(THEME_STORAGE_KEY, seed);
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

function clearThemeDom(): void {
  document.documentElement.removeAttribute('data-theme');
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
}

describe('ThemeService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    clearThemeDom();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    clearThemeDom();
  });

  it('ofrece dieciocho temas claros, sin nocturno, con Creador como default', () => {
    expect(THEME_IDS).toEqual([
      'creator', 'flamenco', 'conservatorio', 'escuela', 'editorial', 'cuaderno',
      'minimal', 'atelier', 'taller', 'estudio', 'impacto', 'linea', 'brutalista',
      'energia', 'jugueton', 'glass', 'serio', 'prensa',
    ]);
    expect(THEME_IDS).toHaveLength(18);
    expect(THEME_IDS).not.toContain('nocturno');
    expect(THEME_OPTIONS.map((option) => option.label)).toEqual([
      'Creador', 'Flamenco editorial', 'Conservatorio', 'Escuela clásica',
      'Editorial de bolsillo', 'Cuaderno del profesor', 'Minimal técnico',
      'Atelier boutique', 'Taller artesanal', 'Estudio de grabación',
      'Impacto AG', 'Línea precisa', 'Brutalista AG', 'Energía en pista',
      'Juguetón', 'Cristal sereno', 'Serio corporativo', 'Prensa cultural',
    ]);
    expect(DEFAULT_THEME_ID).toBe('creator');
    expect(isThemeId('nocturno')).toBe(false);
  });

  it('empieza en creator y aplica data-theme y meta theme-color', () => {
    const { service, meta, root } = setup();
    expect(service.theme()).toBe('creator');
    expect(service.resolvedTheme()).toBe('creator');
    expect(root.getAttribute('data-theme')).toBe('creator');
    expect(meta.content).toBe(THEME_META_COLORS['creator']);
  });

  it('setTheme actualiza signals, persiste y aplica el tema', () => {
    const storage = memoryStorage();
    const { service, meta, root } = setup(storage);
    service.setTheme('prensa');
    expect(service.theme()).toBe('prensa');
    expect(service.resolvedTheme()).toBe('prensa');
    expect(JSON.parse(storage.writes[0])).toEqual({ version: THEME_STORAGE_VERSION, theme: 'prensa' });
    expect(root.getAttribute('data-theme')).toBe('prensa');
    expect(meta.content).toBe(THEME_META_COLORS['prensa']);
  });

  it('los seis temas nuevos persisten y aplican su id estable', () => {
    for (const id of ['cuaderno', 'glass', 'serio', 'prensa', 'escuela', 'editorial'] as const) {
      TestBed.resetTestingModule();
      clearThemeDom();
      const storage = memoryStorage();
      const { service, meta, root } = setup(storage);
      service.setTheme(id);
      expect(service.theme()).toBe(id);
      expect(JSON.parse(storage.writes[0])).toEqual({ version: THEME_STORAGE_VERSION, theme: id });
      expect(root.getAttribute('data-theme')).toBe(id);
      expect(meta.content).toBe(THEME_META_COLORS[id]);
    }
  });

  it('restaura un tema válido guardado al construirse', () => {
    const stored = JSON.stringify({ version: THEME_STORAGE_VERSION, theme: 'glass' });
    const { service, root } = setup(memoryStorage(stored));
    expect(service.theme()).toBe('glass');
    expect(root.getAttribute('data-theme')).toBe('glass');
  });

  it('ignora valores inválidos, incluido el id oscuro retirado nocturno', () => {
    const invalid = [
      'no-es-json',
      JSON.stringify({ version: THEME_STORAGE_VERSION + 1, theme: 'prensa' }),
      JSON.stringify({ version: THEME_STORAGE_VERSION, theme: 'neon' }),
      JSON.stringify({ version: THEME_STORAGE_VERSION, theme: 'nocturno' }),
      JSON.stringify({ version: THEME_STORAGE_VERSION }),
      'null',
    ];
    for (const raw of invalid) {
      TestBed.resetTestingModule();
      clearThemeDom();
      const { service, root } = setup(memoryStorage(raw));
      expect(service.theme()).toBe(DEFAULT_THEME_ID);
      expect(root.getAttribute('data-theme')).toBe('creator');
    }
  });

  it('funciona sin localStorage y con almacenamiento que lanza', () => {
    const noStorage = setup(null);
    expect(noStorage.service.theme()).toBe('creator');
    expect(() => noStorage.service.setTheme('serio')).not.toThrow();
    expect(noStorage.service.theme()).toBe('serio');
    TestBed.resetTestingModule();
    const blocked: StorageStub = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const { service } = setup(blocked);
    expect(service.theme()).toBe('creator');
    expect(() => service.setTheme('cuaderno')).not.toThrow();
    expect(service.theme()).toBe('cuaderno');
  });

  it('persiste solo versión e id, sin datos personales', () => {
    const storage = memoryStorage();
    const { service } = setup(storage);
    service.setTheme('creator');
    const raw = storage.writes[0];
    expect(JSON.parse(raw)).toEqual({ version: 1, theme: 'creator' });
    expect(raw).not.toMatch(/email|token|user|alumno|@/i);
  });

  it('está en el inyector raíz y los 18 colores son únicos', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ThemeService)).toBeInstanceOf(ThemeService);
    const colors = THEME_IDS.map((id) => THEME_META_COLORS[id]);
    expect(new Set(colors).size).toBe(18);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
