import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import Stripe from 'npm:stripe@23.1.0';
import { makeHandler } from './handler.ts';
import { createDependencies } from './adapter.ts';

// No activar hasta completar y revisar el procesamiento comercial.
const enabled = false;
const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const stripe = new Stripe('sk_test_unused', { httpClient: Stripe.createFetchHttpClient() });
const client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
Deno.serve(makeHandler(client ? createDependencies(stripe, Stripe.createSubtleCryptoProvider(), client) : {
  async verify() { throw new Error('Configuración ausente'); },
  async record() { throw new Error('Configuración ausente'); },
}, { enabled: enabled && !!client, secret, expectedLiveMode: false }));
