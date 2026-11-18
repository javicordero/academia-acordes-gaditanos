import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { isDevelopmentEnvironment, makeHandler, ttlFromEnv, type Dependencies } from './handler.ts';
import { createDependencies } from './adapter.ts';

// La firma vive solo en Web Crypto del servidor; Deno no necesita claves en el cliente.
const sha256Hex = async (seed: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const url = Deno.env.get('SUPABASE_URL') ?? null;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID') ?? null;
const tokenAuthKey = Deno.env.get('BUNNY_STREAM_TOKEN_AUTH_KEY') ?? null;
const configured = Deno.env.get('VIDEO_TOKEN_ALLOWED_ORIGINS');
const origins = configured ? configured.split(',').map(s => s.trim()).filter(Boolean) : undefined;

// Fail-closed: sin credenciales de Supabase la función falla cerrada (500) y no consulta ni firma nada; el modulo carga igual.
const client = url && key
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const dependencies: Dependencies = client
  ? createDependencies(client)
  : {
      getUser: async () => { throw new Error('Sin configuracion'); },
      video: async () => { throw new Error('Sin configuracion'); },
      sign: async () => { throw new Error('Sin configuracion'); },
    };

// Entorno explícito: ausente u otro valor equivale a producción. El modo sin
// firma solo puede activarse en DEV, y el handler vuelve a comprobarlo.
const environment = Deno.env.get('BUNNY_ENVIRONMENT') ?? 'production';
const allowUnsignedDev = isDevelopmentEnvironment(environment)
  && Deno.env.get('BUNNY_ALLOW_UNSIGNED_EMBED') === '1';

Deno.serve(makeHandler(dependencies, {
  libraryId,
  tokenAuthKey,
  ttlSeconds: ttlFromEnv(Deno.env.get('BUNNY_VIDEO_TOKEN_TTL_SECONDS')),
  allowUnsignedDev,
  environment,
}, sha256Hex, origins));
