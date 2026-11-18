import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import {
  makeHandler, maxBytesFromEnv, ttlFromEnv, type Config, type Dependencies,
} from './handler.ts';
import { createDependencies } from './adapter.ts';

// Sin secretos en el repositorio: todo se lee del entorno de la Edge Function.
// El módulo carga aunque falte configuración; el handler responde 503 (fail closed).
const url = Deno.env.get('SUPABASE_URL') ?? null;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
const libraryId = (Deno.env.get('BUNNY_STREAM_LIBRARY_ID') ?? '').trim();
const apiKey = (Deno.env.get('BUNNY_STREAM_API_KEY') ?? '').trim();
const configured = /^[0-9]{1,12}$/.test(libraryId) && apiKey.length > 0;

const client = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// Los mocks de seguridad no filtran nada: con configuración ausente nunca se
// llega a usar esta rama porque makeHandler devuelve 503 antes de tocar Auth.
const inert: Dependencies = {
  getUser: async () => null,
  isAdmin: async () => false,
  status: async () => ({ kind: 'denied' }),
  reserve: async () => ({ kind: 'denied' }),
  attach: async () => ({ kind: 'denied' }),
  refresh: async () => ({ kind: 'denied' }),
  sync: async () => ({ kind: 'denied' }),
  markReview: async () => false,
  createVideo: async () => ({ kind: 'ambiguous' }),
  videoStatus: async () => null,
  signUpload: async () => { throw new Error('Sin configuración'); },
};

const dependencies: Dependencies = client && configured
  ? createDependencies(client, { libraryId, apiKey })
  : inert;

const configuredOrigins = Deno.env.get('VIDEO_UPLOAD_ALLOWED_ORIGINS');
const origins = configuredOrigins
  ? configuredOrigins.split(',').map(value => value.trim()).filter(Boolean)
  : undefined;

const config: Config = {
  configured,
  libraryId: configured ? libraryId : null,
  maxBytes: maxBytesFromEnv(Deno.env.get('VIDEO_UPLOAD_MAX_BYTES')),
  ttlSeconds: ttlFromEnv(Deno.env.get('BUNNY_UPLOAD_AUTH_TTL_SECONDS')),
};

Deno.serve(makeHandler(dependencies, config, origins));
