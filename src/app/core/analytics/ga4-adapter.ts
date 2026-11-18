import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { AnalyticsAdapter } from './analytics-adapter';

interface GtagWindow extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

/**
 * Adaptador GA4: inyecta `gtag.js` en cuanto se le pide, nunca desde el HTML y
 * nunca antes del consentimiento. No usa GTM ni AdSense y no escribe cookies
 * propias: solo el stub estándar de `gtag` y la marca de opt-out de GA.
 */
@Injectable({ providedIn: 'root' })
export class Ga4Adapter implements AnalyticsAdapter {
  private readonly document = inject(DOCUMENT);
  private loadedId: string | null = null;

  load(measurementId: string, cookieDomain = ''): void {
    const win = this.window();
    if (!win || this.loadedId === measurementId) return;
    this.loadedId = measurementId;

    win.dataLayer ??= [];
    win.gtag ??= (...args: unknown[]) => {
      win.dataLayer?.push(args);
    };

    const script = this.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    this.document.head.appendChild(script);

    win.gtag('js', new Date());
    win.gtag('config', measurementId, this.configParameters(cookieDomain));
  }

  pageView(measurementId: string, path: string, cookieDomain = ''): void {
    if (this.loadedId !== measurementId) return;
    this.window()?.gtag?.('config', measurementId, {
      page_path: path,
      ...this.configParameters(cookieDomain),
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

  private window(): GtagWindow | undefined {
    return this.document.defaultView as GtagWindow | undefined;
  }
}
