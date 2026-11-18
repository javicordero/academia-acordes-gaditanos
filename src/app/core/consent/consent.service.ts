import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { SUPABASE_CONFIG } from '../../../environments/supabase-config';

/** Clave propia y versionada: solo guarda la decisión, nunca datos de la persona. */
export const CONSENT_STORAGE_KEY = 'academia-cookie-consent';
export const CONSENT_COOKIE_NAME = 'academia-cookie-consent';
export const CONSENT_STORAGE_VERSION = 1;
/** Persistencia técnica del registro de consentimiento; se renueva al cambiarlo. */
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface ConsentPreferences {
  /** Las necesarias no se pueden desactivar: recuerdan esta elección. */
  readonly necessary: true;
  readonly analytics: boolean;
}

interface StoredConsent {
  readonly version: number;
  readonly analytics: boolean;
}

/** La cookie compartida añade las necesarias y cuándo se decidió, sin PII. */
interface SharedConsent extends StoredConsent {
  readonly necessary: true;
  readonly updatedAt: number;
}

/**
 * Estado del consentimiento con signals. En `localStorage` guarda solo
 * `{version, analytics}`; si hay un dominio compartido configurado, replica la
 * decisión en una cookie propia del dominio raíz (necesarias + analytics +
 * versión + timestamp) para no volver a preguntar al pasar del dominio al
 * subdominio. Ni correos, ni identificadores, ni tokens, ni datos de cursos.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(SUPABASE_CONFIG);

  private readonly _preferences = signal<ConsentPreferences>({
    necessary: true,
    analytics: false,
  });
  private readonly _hasDecision = signal(false);
  private readonly _preferencesOpen = signal(false);
  private readonly _draftAnalytics = signal(false);
  private readonly changesSubject = new Subject<ConsentPreferences>();

  readonly preferences = this._preferences.asReadonly();
  readonly hasDecision = this._hasDecision.asReadonly();
  readonly preferencesOpen = this._preferencesOpen.asReadonly();
  readonly draftAnalytics = this._draftAnalytics.asReadonly();

  /** La app muestra el banner inicial mientras no haya decisión o se esté editando. */
  readonly bannerVisible = computed(
    () => !this._hasDecision() || this._preferencesOpen(),
  );

  /** Efectos secundarios (p. ej. analítica) reaccionan sin depender de un effect. */
  readonly changes = this.changesSubject.asObservable();

  constructor() {
    // La cookie del dominio compartido manda: localStorage es por origen.
    const stored = this.readCookie() ?? this.readStorage();
    if (!stored) return;
    this._preferences.set({ necessary: true, analytics: stored.analytics });
    this._hasDecision.set(true);
  }

  acceptAll(): void {
    this.commit(true);
  }

  rejectOptional(): void {
    this.commit(false);
  }

  setDraftAnalytics(value: boolean): void {
    this._draftAnalytics.set(value);
  }

  savePreferences(): void {
    this.commit(this._draftAnalytics());
  }

  openPreferences(): void {
    this._draftAnalytics.set(this._preferences().analytics);
    this._preferencesOpen.set(true);
  }

  /** Solo cierra el panel: nunca guarda ni cambia la decisión existente. */
  closePreferences(): void {
    this._preferencesOpen.set(false);
  }

  private get cookieDomain(): string {
    return (this.config.analyticsCookieDomain ?? '').trim();
  }

  private commit(analytics: boolean): void {
    this._preferences.set({ necessary: true, analytics });
    this._hasDecision.set(true);
    this._preferencesOpen.set(false);
    const stored: StoredConsent = {
      version: CONSENT_STORAGE_VERSION,
      analytics,
    };
    this.writeStorage(stored);
    this.writeCookie({ ...stored, necessary: true, updatedAt: Date.now() });
    this.changesSubject.next(this._preferences());
  }

  private readCookie(): SharedConsent | null {
    const domain = this.cookieDomain;
    if (!domain) return null;
    try {
      const prefix = `${CONSENT_COOKIE_NAME}=`;
      const entry = this.document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix));
      if (!entry) return null;
      const decoded: unknown = JSON.parse(
        decodeURIComponent(entry.slice(prefix.length)),
      );
      if (typeof decoded !== 'object' || decoded === null) return null;
      const candidate = decoded as Partial<SharedConsent>;
      if (
        candidate.version !== CONSENT_STORAGE_VERSION ||
        candidate.necessary !== true ||
        typeof candidate.analytics !== 'boolean' ||
        typeof candidate.updatedAt !== 'number'
      ) {
        return null;
      }
      return {
        version: candidate.version,
        necessary: true,
        analytics: candidate.analytics,
        updatedAt: candidate.updatedAt,
      };
    } catch {
      return null;
    }
  }

  private writeCookie(value: SharedConsent): void {
    const domain = this.cookieDomain;
    if (!domain) return;
    try {
      const secure =
        this.document.defaultView?.location?.protocol === 'https:'
          ? '; Secure'
          : '';
      this.document.cookie =
        `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}` +
        `; Path=/; Domain=${domain}; Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    } catch {
      // Dominio no válido en este entorno: sigue vigente el localStorage local.
    }
  }

  private readStorage(): StoredConsent | null {
    const storage = this.document.defaultView?.localStorage;
    if (!storage) return null;

    try {
      const raw = storage.getItem(CONSENT_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        storage.removeItem(CONSENT_STORAGE_KEY);
        return null;
      }
      const candidate = parsed as Partial<StoredConsent>;
      if (
        candidate.version !== CONSENT_STORAGE_VERSION ||
        typeof candidate.analytics !== 'boolean'
      ) {
        storage.removeItem(CONSENT_STORAGE_KEY);
        return null;
      }
      return { version: candidate.version, analytics: candidate.analytics };
    } catch {
      return null;
    }
  }

  private writeStorage(value: StoredConsent): void {
    const storage = this.document.defaultView?.localStorage;
    if (!storage) return;
    try {
      storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Modo privado o almacenamiento bloqueado: la decisión sigue activa en esta sesión.
    }
  }
}
