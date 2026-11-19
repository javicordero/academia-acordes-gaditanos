import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Clave versionada y exclusiva: solo guarda el id del tema, nunca datos personales. */
export const THEME_STORAGE_KEY = 'academia-theme-v1';
export const THEME_STORAGE_VERSION = 1;
export const DEFAULT_THEME_ID = 'creator';

/** Unión cerrada: seis temas explícitos, sin detección sistema/claro/oscuro. */
export const THEME_IDS = [
  'creator',
  'flamenco',
  'conservatorio',
  'nocturno',
  'contraste',
  'brutalista',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeOption {
  readonly id: ThemeId;
  readonly label: string;
}

/** Orden y nombres visibles en el selector; Creador es el predeterminado. */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: 'creator', label: 'Creador' },
  { id: 'flamenco', label: 'Flamenco editorial' },
  { id: 'conservatorio', label: 'Conservatorio' },
  { id: 'nocturno', label: 'Nocturno AG' },
  { id: 'contraste', label: 'Alto contraste' },
  { id: 'brutalista', label: 'Brutalista AG' },
];

/** Color de la barra del navegador, coherente con cada tema. */
export const THEME_META_COLORS: Record<ThemeId, string> = {
  creator: '#0f1115',
  flamenco: '#f6efe3',
  conservatorio: '#edf2f4',
  nocturno: '#0a1220',
  contraste: '#000000',
  brutalista: '#e9e4d9',
};

interface StoredTheme {
  readonly version: number;
  readonly theme: ThemeId;
}

export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
  );
}

/**
 * Estado del tema con signals. Persiste únicamente `{version, theme}` en
 * localStorage; aplica `data-theme` en <html> y, si existe, el meta
 * `theme-color`. Sin PII y sin claves ni secretos en el cliente.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly _theme = signal<ThemeId>(this.readStored());

  readonly theme = this._theme.asReadonly();
  /** Tema efectivamente aplicado al documento. Hoy coincide con `theme`. */
  readonly resolvedTheme = computed(() => this._theme());

  constructor() {
    this.apply(this._theme());
  }

  setTheme(id: ThemeId): void {
    const next: ThemeId = isThemeId(id) ? id : DEFAULT_THEME_ID;
    if (next !== this._theme()) {
      this._theme.set(next);
    }
    this.writeStored(next);
    this.apply(next);
  }

  private apply(id: ThemeId): void {
    this.document.documentElement.dataset['theme'] = id;
    const meta = this.document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (meta) {
      meta.content = THEME_META_COLORS[id];
    }
  }

  private readStored(): ThemeId {
    const storage = this.document.defaultView?.localStorage;
    if (!storage) return DEFAULT_THEME_ID;

    try {
      const raw = storage.getItem(THEME_STORAGE_KEY);
      if (!raw) return DEFAULT_THEME_ID;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return DEFAULT_THEME_ID;
      const candidate = parsed as Partial<StoredTheme>;
      if (
        candidate.version !== THEME_STORAGE_VERSION ||
        !isThemeId(candidate.theme)
      ) {
        return DEFAULT_THEME_ID;
      }
      return candidate.theme;
    } catch {
      return DEFAULT_THEME_ID;
    }
  }

  private writeStored(id: ThemeId): void {
    const storage = this.document.defaultView?.localStorage;
    if (!storage) return;

    try {
      const stored: StoredTheme = { version: THEME_STORAGE_VERSION, theme: id };
      storage.setItem(THEME_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Modo privado o almacenamiento bloqueado: el tema sigue activo en esta sesión.
    }
  }
}
