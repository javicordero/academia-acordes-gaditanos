import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { AnalyticsAdapter } from './analytics-adapter';

interface GtagWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

/**
 * Estado inicial de Consent Mode v2: todo denegado, incluidas las señales
 * publicitarias, que la academia nunca activa. Se encola en `dataLayer` antes
 * de cargar `gtag.js`: es solo un array en memoria, sin petición de red.
 */
const DEFAULT_CONSENT = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500,
} as const;

/**
 * Adaptador GA4: encola el consentimiento por defecto al arrancar y solo
 * inyecta `gtag.js` cuando el servicio ha verificado ID + consentimiento + DNT.
 * No usa GTM ni AdSense y no activa señales publicitarias. Es más estricto que
 * un Consent Mode completo: sin consentimiento no se carga el script, así que
 * no hay pings `denied` hacia Google.
 */
@Injectable({ providedIn: 'root' })
export class Ga4Adapter implements AnalyticsAdapter {
  private readonly document = inject(DOCUMENT);
  private loadedId: string | null = null;
  private consentGranted = false;

  constructor() {
    this.gtag()('consent', 'default', { ...DEFAULT_CONSENT });
  }

  load(measurementId: string, cookieDomain = ''): void {
    const win = this.window();
    if (!win || this.loadedId === measurementId) return;
    this.loadedId = measurementId;

    const gtag = this.gtag();
    const script = this.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    this.document.head.appendChild(script);

    gtag('js', new Date());
    this.updateConsent(true);
    gtag('config', measurementId, this.configParameters(cookieDomain));
  }

  pageView(measurementId: string, path: string, cookieDomain = ''): void {
    if (this.loadedId !== measurementId || !this.consentGranted) return;
    this.window()?.gtag?.('config', measurementId, {
      page_path: path,
      ...this.configParameters(cookieDomain),
    });
  }

  /** Refleja la analítica; las señales `ad_*` permanecen siempre denegadas. */
  updateConsent(analyticsGranted: boolean): void {
    this.consentGranted = analyticsGranted;
    if (!this.loadedId) return; // sin script cargado no se envía nada a Google
    this.gtag()('consent', 'update', {
      analytics_storage: analyticsGranted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  optOut(measurementId: string, disabled: boolean): void {
    const win = this.window();
    if (!win) return;
    (win as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] =
      disabled;
  }

  /** Sin dominio configurado se omite `cookie_domain`: GA decide por su cuenta. */
  private configParameters(cookieDomain: string): Record<string, unknown> {
    return cookieDomain
      ? { cookie_domain: cookieDomain, anonymize_ip: true }
      : { anonymize_ip: true };
  }

  /** Crea el dataLayer y el stub de gtag una sola vez, sin cargar el script. */
  private gtag(): (...args: unknown[]) => void {
    const win = this.window();
    if (!win) return () => {};
    win.dataLayer ??= [];
    win.gtag ??= (...args: unknown[]) => {
      win.dataLayer?.push(args);
    };
    return win.gtag;
  }

  private window(): GtagWindow | undefined {
    return this.document.defaultView as GtagWindow | undefined;
  }
}
