import { InjectionToken, inject } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import {
  SUPABASE_CONFIG,
  isSupabaseConfigComplete,
} from '../../../environments/supabase-config';

/**
 * Cliente Supabase singleton para toda la aplicación.
 *
 * Devuelve `null` mientras no haya configuración local completa. El flujo PKCE
 * se gestiona explícitamente en `/auth/callback`, por eso `detectSessionInUrl`
 * queda desactivado y no se guardan tokens en la URL de la aplicación.
 */
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient | null>(
  'SUPABASE_CLIENT',
  {
    providedIn: 'root',
    factory: () => {
      const config = inject(SUPABASE_CONFIG);

      if (!isSupabaseConfigComplete(config)) {
        return null;
      }

      return createClient(config.url, config.publishableKey, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    },
  },
);
