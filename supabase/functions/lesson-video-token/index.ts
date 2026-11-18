import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { makeHandler, ttlFromEnv, type Dependencies } from './handler.ts';
import { createDependencies } from './adapter.ts';

// La firma vive solo en node:crypto del servidor; Deno no necesita claves en el cliente.
const sha256Hex = async (seed: string): Promise<string> => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(seed).digest('hex');
};

const url = Deno.env.get('SUPABASE_URL') ?? null;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID') ?? null;
const tokenAuthKey = Deno.env.get('BUNNY_STREAM_TOKEN_AUTH_KEY') ?? null;
const configured = Deno.env.get('LESSON_VIDEO_TOKEN_ALLOWED_ORIGINS');
const origins = configured ? configured.split(',').map(s => s.trim()).filter(Boolean) : undefined;

// Fail-closed: sin credenciales de Supabase la funcion responde 503; el modulo carga igual.
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

Deno.serve(makeHandler(dependencies, {
  libraryId,
  tokenAuthKey,
  ttlSeconds: ttlFromEnv(Deno.env.get('BUNNY_VIDEO_TOKEN_TTL_SECONDS')),
}, sha256Hex, origins));
