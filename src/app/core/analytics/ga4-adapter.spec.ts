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

function setup() {
  const scripts: FakeScript[] = [];
  const win: FakeWindow = { dataLayer: undefined, gtag: undefined };
  const documentStub = {
    defaultView: win,
    createElement: vi.fn(() => ({ async: false, src: '' })),
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
  return { adapter, win, scripts, calls };
}

describe('Ga4Adapter', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('inyecta gtag.js de forma dinámica y configura la IP anonimizada', () => {
    const { adapter, win, scripts, calls } = setup();

    adapter.load('G-ACADEMIA');

    expect(scripts).toHaveLength(1);
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].src).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-ACADEMIA',
    );
    expect(typeof win.gtag).toBe('function');
    expect(calls()[0][0]).toBe('js');
    expect(calls()[1]).toEqual([
      'config',
      'G-ACADEMIA',
      { anonymize_ip: true },
    ]);
  });

  it('no inyecta dos veces el mismo ID', () => {
    const { adapter, scripts, calls } = setup();

    adapter.load('G-ACADEMIA');
    adapter.load('G-ACADEMIA');

    expect(scripts).toHaveLength(1);
    expect(calls()).toHaveLength(2);
  });

  it('no envía página antes de cargar y después envía solo la ruta pública', () => {
    const { adapter, win, calls } = setup();

    adapter.pageView('G-ACADEMIA', '/cursos');
    expect(calls()).toHaveLength(0);

    adapter.load('G-ACADEMIA');
    adapter.pageView('G-ACADEMIA', '/cursos');

    expect(typeof win.gtag).toBe('function');
    expect(calls()[2]).toEqual([
      'config',
      'G-ACADEMIA',
      { page_path: '/cursos', anonymize_ip: true },
    ]);
  });

  it('añade cookie_domain solo cuando hay dominio compartido configurado', () => {
    const { adapter, calls } = setup();

    adapter.load('G-ACADEMIA', '.example.test');
    adapter.pageView('G-ACADEMIA', '/cursos', '.example.test');

    expect(calls()[1][2]).toEqual({
      cookie_domain: '.example.test',
      anonymize_ip: true,
    });
    expect(calls()[2][2]).toEqual({
      page_path: '/cursos',
      cookie_domain: '.example.test',
      anonymize_ip: true,
    });
  });

  it('sin dominio no envía cookie_domain en ninguna llamada', () => {
    const { adapter, calls } = setup();

    adapter.load('G-ACADEMIA', '');
    adapter.pageView('G-ACADEMIA', '/cursos', '');

    expect(calls()[1][2]).toEqual({ anonymize_ip: true });
    expect(calls()[2][2]).toEqual({
      page_path: '/cursos',
      anonymize_ip: true,
    });
    expect(JSON.stringify(calls())).not.toContain('cookie_domain');
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
