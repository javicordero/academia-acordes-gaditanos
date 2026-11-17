import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { makeHandler } from './handler.ts';
import { createDependencies } from './adapter.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('Configuración de servidor ausente');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const configured = Deno.env.get('LESSON_RESOURCES_ALLOWED_ORIGINS');
const origins = configured ? configured.split(',').map(s => s.trim()).filter(Boolean) : ['http://localhost:4200'];

Deno.serve(makeHandler(createDependencies(client), origins));
