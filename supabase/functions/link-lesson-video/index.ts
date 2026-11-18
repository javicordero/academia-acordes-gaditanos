import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { makeHandler } from './handler.ts';
import { createDependencies } from './adapter.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Configuración de servidor ausente');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Ningún valor por defecto: sin ambos secretos la función falla cerrada (503).
const libraryId = (Deno.env.get('BUNNY_STREAM_LIBRARY_ID') ?? '').trim();
const apiKey = (Deno.env.get('BUNNY_STREAM_API_KEY') ?? '').trim();
const configured = /^[0-9]{1,12}$/.test(libraryId) && apiKey.length > 0;

const configuredOrigins = [
  Deno.env.get('VIDEO_ADMIN_ALLOWED_ORIGINS'),
  Deno.env.get('VIDEO_USAGE_ALLOWED_ORIGINS'),
].filter(Boolean).flatMap(value => (value as string).split(','));
const origins = configuredOrigins.length
  ? configuredOrigins.map(value => value.trim()).filter(value => value && value !== '*')
  : ['http://localhost:4200'];

Deno.serve(makeHandler(
  createDependencies(client, { libraryId, apiKey }),
  { libraryId: configured ? libraryId : null, configured },
  origins,
));
