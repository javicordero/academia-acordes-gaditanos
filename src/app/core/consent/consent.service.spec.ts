import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import {
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  CONSENT_COOKIE_NAME,
  CONSENT_STORAGE_KEY,
  CONSENT_STORAGE_VERSION,
  ConsentService,
} from './consent.service';

function createService(): ConsentService {
  TestBed.configureTestingModule({});
  return TestBed.inject(ConsentService);
}

/** Documento falso con un jar de cookies de dominio, sin APIs de Node. */
function setupShared(options: {
  domain: string;
  cookie?: string;
  stored?: string;
}) {
  const jar = { value: options.cookie ?? '' };
  const writes: string[] = [];
  const storage = new Map<string, string>();
  if (options.stored) storage.set(CONSENT_STORAGE_KEY, options.stored);
  const localStorageStub = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
  };
  const documentStub = {
    defaultView: {
      localStorage: localStorageStub,
      location: { protocol: 'https:' },
    },
    get cookie(): string {
      return jar.value;
    },
    set cookie(value: string) {
      writes.push(value);
      const pair = value.split(';', 1)[0].trim();
      const name = pair.split('=', 1)[0];
      const others = jar.value
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith(`${name}=`));
      jar.value = [pair, ...others].join('; ');
    },
  } as unknown as Document;

  TestBed.configureTestingModule({
    providers: [
      { provide: DOCUMENT, useValue: documentStub },
      {
        provide: SUPABASE_CONFIG,
        useValue: {
          url: '',
          publishableKey: '',
          analyticsCookieDomain: options.domain,
        },
      },
    ],
  });
  return { service: TestBed.inject(ConsentService), jar, writes, storage };
}

describe('ConsentService', () => {
  beforeEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('empieza sin decisión: necesarias activas y analítica apagada', () => {
    const service = createService();

    expect(service.preferences()).toEqual({ necessary: true, analytics: false });
    expect(service.hasDecision()).toBe(false);
    expect(service.bannerVisible()).toBe(true);
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it('aceptar todo persiste solo la decisión versionada, sin datos personales', () => {
    const service = createService();

    service.acceptAll();

    expect(service.preferences()).toEqual({ necessary: true, analytics: true });
    expect(service.hasDecision()).toBe(true);
    expect(service.bannerVisible()).toBe(false);
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY) ?? '';
    expect(JSON.parse(raw)).toEqual({
      version: CONSENT_STORAGE_VERSION,
      analytics: true,
    });
    expect(raw).not.toMatch(/email|token|user|alumno|@/i);
  });

  it('rechazar opcional guarda el estado sin conceder analítica', () => {
    const service = createService();

    service.rejectOptional();

    expect(service.preferences().analytics).toBe(false);
    expect(service.hasDecision()).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? '')).toEqual({
      version: CONSENT_STORAGE_VERSION,
      analytics: false,
    });
  });

  it('personalizar permite cambiar la preferencia en ambos sentidos', () => {
    const service = createService();

    service.openPreferences();
    expect(service.preferencesOpen()).toBe(true);
    expect(service.draftAnalytics()).toBe(false);

    service.setDraftAnalytics(true);
    service.savePreferences();
    expect(service.preferences().analytics).toBe(true);
    expect(service.preferencesOpen()).toBe(false);

    service.openPreferences();
    expect(service.draftAnalytics()).toBe(true);
    service.setDraftAnalytics(false);
    service.savePreferences();
    expect(service.preferences().analytics).toBe(false);
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? '')).toEqual({
      version: CONSENT_STORAGE_VERSION,
      analytics: false,
    });
  });

  it('abrir y cancelar no guarda ni cambia la decisión', () => {
    const service = createService();

    service.openPreferences();
    service.setDraftAnalytics(true);
    service.closePreferences();

    expect(service.preferencesOpen()).toBe(false);
    expect(service.preferences().analytics).toBe(false);
    expect(service.hasDecision()).toBe(false);
    expect(service.bannerVisible()).toBe(true);
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it('restaura una decisión guardada sin volver a mostrar el banner inicial', () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_STORAGE_VERSION, analytics: true }),
    );

    const service = createService();

    expect(service.preferences()).toEqual({ necessary: true, analytics: true });
    expect(service.hasDecision()).toBe(true);
    expect(service.bannerVisible()).toBe(false);
  });

  it('ignora un estado corrupto o de otra versión', () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ version: CONSENT_STORAGE_VERSION + 1, analytics: true }),
    );

    const service = createService();

    expect(service.hasDecision()).toBe(false);
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it('notifica cada cambio para que la analítica reaccione', () => {
    const service = createService();
    const listener = vi.fn();
    service.changes.subscribe(listener);

    service.acceptAll();
    service.rejectOptional();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, {
      necessary: true,
      analytics: true,
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      necessary: true,
      analytics: false,
    });
  });

  it('con dominio compartido escribe una cookie sin PII con versión y timestamp', () => {
    const { service, writes } = setupShared({ domain: '.example.test' });

    service.acceptAll();

    expect(writes).toHaveLength(1);
    const header = writes[0];
    expect(header).toContain(`Domain=.example.test`);
    expect(header).toContain('Path=/');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Secure');
    expect(header).toContain(`Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}`);
    const raw = header.split(';', 1)[0].split('=', 2)[1];
    const decoded = JSON.parse(decodeURIComponent(raw));
    expect(decoded).toEqual({
      version: CONSENT_STORAGE_VERSION,
      necessary: true,
      analytics: true,
      updatedAt: expect.any(Number),
    });
    expect(raw).not.toMatch(/email|token|jwt|user|@/i);
  });

  it('lee la cookie compartida antes que el localStorage del origen actual', () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        version: CONSENT_STORAGE_VERSION,
        necessary: true,
        analytics: true,
        updatedAt: 1700000000000,
      }),
    );
    const { service } = setupShared({
      domain: '.example.test',
      cookie: `${CONSENT_COOKIE_NAME}=${cookie}`,
      stored: JSON.stringify({ version: CONSENT_STORAGE_VERSION, analytics: false }),
    });

    expect(service.preferences().analytics).toBe(true);
    expect(service.hasDecision()).toBe(true);
  });

  it('sin dominio configurado no crea ninguna cookie', () => {
    const { service, writes, storage } = setupShared({ domain: '' });

    service.rejectOptional();

    expect(writes).toHaveLength(0);
    expect(storage.get(CONSENT_STORAGE_KEY)).toBe(
      JSON.stringify({ version: CONSENT_STORAGE_VERSION, analytics: false }),
    );
  });

  it('una cookie compartida inválida deja usar el localStorage', () => {
    const { service } = setupShared({
      domain: '.example.test',
      cookie: `${CONSENT_COOKIE_NAME}=${encodeURIComponent(
        JSON.stringify({ version: 99, necessary: true, analytics: true, updatedAt: 1 }),
      )}`,
      stored: JSON.stringify({ version: CONSENT_STORAGE_VERSION, analytics: false }),
    });

    expect(service.hasDecision()).toBe(true);
    expect(service.preferences().analytics).toBe(false);
  });
});
