import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Ga4Adapter } from './ga4-adapter';

interface FakeScript {
  async: boolean;
  src: string;
}

interface FakeWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

const AD_DENIED = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};

function setup() {
  const scripts: FakeScript[] = [];
  const win: FakeWindow = { dataLayer: undefined, gtag: undefined };
  const createElement = vi.fn(() => ({ async: false, src: '' }));
  const documentStub = {
    defaultView: win,
    createElement,
    head: {
      appendChild: vi.fn((node: unknown) => {
        scripts.push(node as FakeScript);
        return node;
      }),
    },
  } as unknown as Document;

  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: documentStub }],
  });
  const adapter = TestBed.inject(Ga4Adapter);
  const calls = (): unknown[][] => (win.dataLayer ?? []) as unknown[][];
  const configs = (): unknown[][] =>
    calls().filter((args) => args[0] === 'config');
  const updates = (): unknown[][] =>
    calls().filter((args) => args[0] === 'consent' && args[1] === 'update');
  return { adapter, win, scripts, createElement, calls, configs, updates };
}

describe('Ga4Adapter', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('encola consent default con ad_* denegados antes de cargar gtag.js', () => {
    const { calls, scripts, createElement } = setup();

    expect(calls()[0]).toEqual([
      'consent',
      'default',
      {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        wait_for_update: 500,
      },
    ]);
    expect(scripts).toHaveLength(0);
    expect(createElement).not.toHaveBeenCalled();
  });

  it('inyecta gtag.js, aplica update granted y configura la IP anonimizada', () => {
    const { adapter, win, scripts, calls, configs, updates } = setup();

    adapter.load('G-ACADEMIA');

    expect(scripts).toHaveLength(1);
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].src).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-ACADEMIA',
    );
    expect(typeof win.gtag).toBe('function');
    expect(calls()[1][0]).toBe('js');
    expect(updates()).toEqual([
      ['consent', 'update', { analytics_storage: 'granted', ...AD_DENIED }],
    ]);
    expect(calls()[2][0]).toBe('consent');
    expect(calls()[3]).toEqual([
      'config',
      'G-ACADEMIA',
      { anonymize_ip: true },
    ]);
    expect(configs()).toHaveLength(1);
  });

  it('nunca activa señales publicitarias en ningún comando de consentimiento', () => {
    const { adapter, calls } = setup();
    adapter.load('G-ACADEMIA');
    adapter.updateConsent(false);
    adapter.updateConsent(true);

    const consentCalls = calls().filter((args) => args[0] === 'consent');
    expect(consentCalls.length).toBeGreaterThan(1);
    for (const args of consentCalls) {
      const payload = args[2] as Record<string, unknown>;
      expect(payload['ad_storage']).toBe('denied');
      expect(payload['ad_user_data']).toBe('denied');
      expect(payload['ad_personalization']).toBe('denied');
    }
  });

  it('no inyecta dos veces el mismo ID', () => {
    const { adapter, scripts, configs, updates } = setup();

    adapter.load('G-ACADEMIA');
    adapter.load('G-ACADEMIA');

    expect(scripts).toHaveLength(1);
    expect(configs()).toHaveLength(1);
    expect(updates()).toHaveLength(1);
  });

  it('no envía página antes de cargar y después envía solo la ruta pública', () => {
    const { adapter, configs } = setup();

    adapter.pageView('G-ACADEMIA', '/cursos');
    expect(configs()).toHaveLength(0);

    adapter.load('G-ACADEMIA');
    adapter.pageView('G-ACADEMIA', '/cursos');

    expect(configs()[1]).toEqual([
      'config',
      'G-ACADEMIA',
      { page_path: '/cursos', anonymize_ip: true },
    ]);
  });

  it('añade cookie_domain solo cuando hay dominio compartido configurado', () => {
    const { adapter, configs } = setup();

    adapter.load('G-ACADEMIA', '.example.test');
    adapter.pageView('G-ACADEMIA', '/cursos', '.example.test');

    expect(configs()[0][2]).toEqual({
      cookie_domain: '.example.test',
      anonymize_ip: true,
    });
    expect(configs()[1][2]).toEqual({
      page_path: '/cursos',
      cookie_domain: '.example.test',
      anonymize_ip: true,
    });
  });

  it('sin dominio no envía cookie_domain en ninguna llamada', () => {
    const { adapter, calls, configs } = setup();

    adapter.load('G-ACADEMIA', '');
    adapter.pageView('G-ACADEMIA', '/cursos', '');

    expect(configs()[0][2]).toEqual({ anonymize_ip: true });
    expect(configs()[1][2]).toEqual({
      page_path: '/cursos',
      anonymize_ip: true,
    });
    expect(JSON.stringify(calls())).not.toContain('cookie_domain');
  });

  it('sin script cargado updateConsent no envía nada a Google', () => {
    const { adapter, calls, updates } = setup();

    adapter.updateConsent(false);
    adapter.updateConsent(true);

    expect(updates()).toHaveLength(0);
    expect(calls()).toHaveLength(1); // solo el consent default
  });

  it('retirar el consentimiento envía update denied y detiene las visitas', () => {
    const { adapter, updates, configs } = setup();

    adapter.load('G-ACADEMIA');
    adapter.updateConsent(false);

    expect(updates()[1]).toEqual([
      'consent',
      'update',
      { analytics_storage: 'denied', ...AD_DENIED },
    ]);
    const enviadas = configs().length;
    adapter.pageView('G-ACADEMIA', '/privado');
    expect(configs()).toHaveLength(enviadas);

    adapter.updateConsent(true);
    expect(updates()[2]).toEqual([
      'consent',
      'update',
      { analytics_storage: 'granted', ...AD_DENIED },
    ]);
  });

  it('escribe y levanta la marca de opt-out de GA', () => {
    const { adapter, win } = setup();

    adapter.optOut('G-ACADEMIA', true);
    expect(
      (win as unknown as Record<string, unknown>)['ga-disable-G-ACADEMIA'],
    ).toBe(true);

    adapter.optOut('G-ACADEMIA', false);
    expect(
      (win as unknown as Record<string, unknown>)['ga-disable-G-ACADEMIA'],
    ).toBe(false);
  });
});
