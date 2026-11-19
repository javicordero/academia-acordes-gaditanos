import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import { ConsentService } from '../consent/consent.service';
import { ANALYTICS_ADAPTER } from './analytics-adapter';

interface DntNavigator {
  doNotTrack?: string | null;
  msDoNotTrack?: string | null;
}

/**
 * Analítica propia y diferida: no carga nada sin ID público, consentimiento de
 * analítica y ausencia de DNT. Solo envía la ruta pública ya resuelta; nunca
 * correos, identificadores ni datos de lecciones privadas.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly consent = inject(ConsentService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly adapter = inject(ANALYTICS_ADAPTER);
  private active = false;

  constructor() {
    this.syncConsent();
    this.consent.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.syncConsent();
    });
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  private get measurementId(): string {
    return (this.config.analyticsMeasurementId ?? '').trim();
  }

  /** Dominio raíz compartido, vacío en DEV: no se envía `cookie_domain`. */
  private get cookieDomain(): string {
    return (this.config.analyticsCookieDomain ?? '').trim();
  }

  private syncConsent(): void {
    const id = this.measurementId;
    if (!id) return;

    if (this.consent.preferences().analytics && !this.doNotTrack()) {
      const wasActive = this.active;
      this.active = true;
      // Si antes se retiró el consentimiento, se levanta el opt-out al darlo de nuevo.
      this.adapter.optOut(id, false);
      // Con script ya cargado se reenvía el estado; si no, lo hace load().
      this.adapter.updateConsent(true);
      if (!wasActive) this.adapter.load(id, this.cookieDomain);
      return;
    }

    if (this.active) {
      this.active = false;
      this.adapter.optOut(id, true);
      this.adapter.updateConsent(false);
    }
  }

  private trackPageView(url: string): void {
    if (!this.active) return;
    const id = this.measurementId;
    if (!id) return;
    // Sin query ni fragmento: no enviamos parámetros que puedan contener datos personales.
    const path = url.split(/[?#]/, 1)[0] || '/';
    this.adapter.pageView(id, path, this.cookieDomain);
  }

  private doNotTrack(): boolean {
    const nav = this.document.defaultView?.navigator as
      | DntNavigator
      | undefined;
    const value = nav?.doNotTrack ?? nav?.msDoNotTrack;
    return value === '1' || value === 'yes';
  }
}
