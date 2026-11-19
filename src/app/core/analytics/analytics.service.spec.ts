import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';

import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import {
  ConsentPreferences,
  ConsentService,
} from '../consent/consent.service';
import { ANALYTICS_ADAPTER } from './analytics-adapter';
import { AnalyticsService } from './analytics.service';

interface SetupOptions {
  id?: string;
  analytics?: boolean;
  dnt?: string;
  domain?: string;
}

function setup(options: SetupOptions = {}) {
  const events = new Subject<unknown>();
  const preferences = signal<ConsentPreferences>({
    necessary: true,
    analytics: options.analytics ?? false,
  });
  const changes = new Subject<ConsentPreferences>();
  const consent = {
    preferences: preferences.asReadonly(),
    changes: changes.asObservable(),
    setAnalytics(analytics: boolean): void {
      preferences.set({ necessary: true, analytics });
      changes.next(preferences());
    },
  };
  const adapter = {
    load: vi.fn(),
    pageView: vi.fn(),
    updateConsent: vi.fn(),
    optOut: vi.fn(),
  };
  const documentStub = {
    defaultView: { navigator: { doNotTrack: options.dnt ?? null } },
  } as unknown as Document;

  TestBed.configureTestingModule({
    providers: [
      {
        provide: SUPABASE_CONFIG,
        useValue: {
          url: '',
          publishableKey: '',
          analyticsMeasurementId: options.id,
          analyticsCookieDomain: options.domain,
        },
      },
      { provide: ConsentService, useValue: consent },
      { provide: ANALYTICS_ADAPTER, useValue: adapter },
      { provide: Router, useValue: { events: events.asObservable() } },
      { provide: DOCUMENT, useValue: documentStub },
    ],
  });

  const service = TestBed.inject(AnalyticsService);
  return {
    service,
    adapter,
    consent,
    navigate(url: string): void {
      events.next(new NavigationEnd(1, url, url));
    },
    otherEvent(): void {
      events.next(new NavigationStart(2, '/cursos'));
    },
  };
}

describe('AnalyticsService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sin consentimiento no carga el script ni envía visitas', () => {
    const { adapter, navigate } = setup({ id: 'G-ACADEMIA' });

    navigate('/cursos');

    expect(adapter.load).not.toHaveBeenCalled();
    expect(adapter.pageView).not.toHaveBeenCalled();
    expect(adapter.optOut).not.toHaveBeenCalled();
    expect(adapter.updateConsent).not.toHaveBeenCalled();
  });

  it('con consentimiento pero sin ID configurado no carga nada', () => {
    const { adapter, navigate } = setup({ analytics: true, id: '' });

    navigate('/cursos');

    expect(adapter.load).not.toHaveBeenCalled();
    expect(adapter.pageView).not.toHaveBeenCalled();
    expect(adapter.updateConsent).not.toHaveBeenCalled();
  });

  it('con ID y consentimiento carga una sola vez y levanta el opt-out', () => {
    const { adapter, consent } = setup({ id: ' G-ACADEMIA ', analytics: true });

    expect(adapter.load).toHaveBeenCalledTimes(1);
    expect(adapter.load).toHaveBeenCalledWith('G-ACADEMIA', '');
    expect(adapter.optOut).toHaveBeenCalledWith('G-ACADEMIA', false);
    expect(adapter.updateConsent).toHaveBeenCalledWith(true);

    consent.setAnalytics(true);
    expect(adapter.load).toHaveBeenCalledTimes(1);
  });

  it('Do Not Track impide cargar la analítica aunque haya consentimiento', () => {
    const { adapter, navigate } = setup({
      id: 'G-ACADEMIA',
      analytics: true,
      dnt: '1',
    });

    navigate('/cursos');

    expect(adapter.load).not.toHaveBeenCalled();
    expect(adapter.pageView).not.toHaveBeenCalled();
    expect(adapter.updateConsent).not.toHaveBeenCalled();
  });

  it('solo cuenta NavigationEnd tras el consentimiento, sin query ni fragmento', () => {
    const { adapter, consent, navigate, otherEvent } = setup({
      id: 'G-ACADEMIA',
    });

    otherEvent();
    navigate('/cursos?comprar=1');
    expect(adapter.pageView).not.toHaveBeenCalled();

    consent.setAnalytics(true);
    otherEvent();
    expect(adapter.pageView).not.toHaveBeenCalled();

    navigate('/mis-cursos?next=%2Faula#frag');
    expect(adapter.pageView).toHaveBeenCalledTimes(1);
    expect(adapter.pageView).toHaveBeenCalledWith('G-ACADEMIA', '/mis-cursos', '');
  });

  it('retirar el consentimiento activa el opt-out y detiene las visitas', () => {
    const { adapter, consent, navigate } = setup({
      id: 'G-ACADEMIA',
      analytics: true,
    });

    consent.setAnalytics(false);
    expect(adapter.optOut).toHaveBeenLastCalledWith('G-ACADEMIA', true);
    expect(adapter.updateConsent).toHaveBeenLastCalledWith(false);

    navigate('/cursos');
    expect(adapter.pageView).not.toHaveBeenCalled();

    consent.setAnalytics(true);
    expect(adapter.optOut).toHaveBeenLastCalledWith('G-ACADEMIA', false);
    expect(adapter.updateConsent).toHaveBeenLastCalledWith(true);
    navigate('/cursos');
    expect(adapter.pageView).toHaveBeenCalledWith('G-ACADEMIA', '/cursos', '');
  });

  it('propaga el dominio compartido a la carga y a las visitas', () => {
    const { adapter, navigate } = setup({
      id: 'G-ACADEMIA',
      analytics: true,
      domain: '.example.test',
    });

    navigate('/aula/curso/leccion');

    expect(adapter.load).toHaveBeenCalledWith('G-ACADEMIA', '.example.test');
    expect(adapter.pageView).toHaveBeenCalledWith(
      'G-ACADEMIA',
      '/aula/curso/leccion',
      '.example.test',
    );
  });
});
