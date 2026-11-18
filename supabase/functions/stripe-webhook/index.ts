import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import Stripe from 'npm:stripe@23.1.0';
import { makeHandler } from './handler.ts';
import { createDependencies } from './adapter.ts';
import { disabledResponse, loadWebhookRuntime } from '../_shared/test-gate-env.ts';

// Sólo entorno del SERVIDOR: nunca petición, cuerpo ni configuración de Angular.
// La gate TEST del webhook es independiente de checkout y de sus términos.
const runtime = loadWebhookRuntime(name => Deno.env.get(name));

// Único uso del placeholder del SDK: construir el verificador cripto cuando la
// gate ya está activa y no hay clave Stripe en el entorno. Nunca se pasa a la
// guarda, nunca llama a la API y jamás habilita nada por sí mismo.
const SDK_ONLY_KEY = 'sk_test_unused';

function enabledHandler(): (request: Request) => Promise<Response> {
  const { supabaseUrl, supabaseServiceRoleKey, stripeWebhookSecret, stripeSecretKey } = runtime.config;
  const client = createClient(supabaseUrl!, supabaseServiceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const stripe = new Stripe(stripeSecretKey ?? SDK_ONLY_KEY, { httpClient: Stripe.createFetchHttpClient() });
  return makeHandler(createDependencies(stripe, Stripe.createSubtleCryptoProvider(), client), {
    enabled: true,
    secret: stripeWebhookSecret,
    // Fijo en servidor: no existe variable de entorno que permita live.
    expectedLiveMode: false,
  });
}

// Producción NO habilitada: sin los flags TEST exactos se mantiene el 503 de
// siempre. No se construyen SDK, cliente ni verificador: la firma,
// los permisos, RLS y los importes siguen siendo autoridad del handler y de SQL.
const serve = runtime.gate.enabled
  ? enabledHandler()
  : () => Promise.resolve(disabledResponse('webhook'));
Deno.serve(serve);
