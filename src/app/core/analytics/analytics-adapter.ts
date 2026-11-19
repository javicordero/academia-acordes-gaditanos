import { InjectionToken, inject } from '@angular/core';

import { Ga4Adapter } from './ga4-adapter';

/** Contrato mínimo para mantener la analítica desacoplada del proveedor. */
export interface AnalyticsAdapter {
  /** Carga el script una sola vez y configura la propiedad propia. */
  load(measurementId: string, cookieDomain?: string): void;
  /** Envía la visita de una ruta pública ya resuelta por el router. */
  pageView(measurementId: string, path: string, cookieDomain?: string): void;
  /** Actualiza el consentimiento de analítica en el proveedor ya cargado. */
  updateConsent(analyticsGranted: boolean): void;
  /** Activa (`true`) o levanta (`false`) el opt-out de GA para esa propiedad. */
  optOut(measurementId: string, disabled: boolean): void;
}

export const ANALYTICS_ADAPTER = new InjectionToken<AnalyticsAdapter>(
  'ANALYTICS_ADAPTER',
  { factory: () => inject(Ga4Adapter) },
);
