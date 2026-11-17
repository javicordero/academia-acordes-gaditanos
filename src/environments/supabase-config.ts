import { InjectionToken } from '@angular/core';

import { environmentLocal } from './environment.local';

/**
 * Configuración del cliente Supabase. La URL y la publishable key son datos
 * públicos que acaban en el navegador; la autorización real vive en RLS y en
 * servidor. Nunca incluir aquí `service_role` ni claves secretas.
 */
export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

export const supabaseConfig: SupabaseConfig = {
  url: environmentLocal.supabaseUrl.trim(),
  publishableKey: environmentLocal.supabasePublishableKey.trim(),
};

export const SUPABASE_CONFIG = new InjectionToken<SupabaseConfig>(
  'SUPABASE_CONFIG',
  { factory: () => supabaseConfig },
);

export function isSupabaseConfigComplete(config: SupabaseConfig): boolean {
  if (!config.url || !config.publishableKey) {
    return false;
  }

  try {
    const parsed = new URL(config.url);
    if (parsed.protocol === 'https:') {
      return true;
    }

    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}
