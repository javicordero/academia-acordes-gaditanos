// Puente entre las variables de entorno del SERVIDOR y las guardas TEST puras.
// No importa Deno ni npm: el index inyecta un lector `Deno.env.get` y las pruebas
// inyectan un mapa falso. Nunca lee petición, cuerpo ni configuración de cliente.
//
// Las guardas NO conceden nada: sólo deciden si el códigolocal puede arrancar en
// modo TEST. Sin flags explícitos la respuesta es la misma de siempre (409 en
// checkout, 503 en webhook) y no se instancian SDK ni clientes de base de datos.
// La aprobación legal de condiciones NO se decide aquí: la fila de términos sigue
// pendiente y la guarda sólo comprueba que la versión esté presente.

import { checkoutTestGate, webhookTestGate, type CheckoutTestGate, type WebhookTestGate } from './test-gates.ts';

export type EnvReader = (name: string) => string | undefined;

export type CheckoutRuntime = {
  gate: CheckoutTestGate;
  config: {
    origins: string[];
    appOrigin: string;
    termsVersion: string | undefined;
    /** literal 'true' Y guarda TEST abierta; nunca se lee de cliente. */
    allowHttpTestOrigin: boolean;
    supabaseUrl: string | undefined;
    supabaseServiceRoleKey: string | undefined;
    stripeSecretKey: string | undefined;
  };
};

export type WebhookRuntime = {
  gate: WebhookTestGate;
  config: {
    supabaseUrl: string | undefined;
    supabaseServiceRoleKey: string | undefined;
    stripeWebhookSecret: string | undefined;
    stripeSecretKey: string | undefined;
  };
};

export type DisabledKind = 'checkout' | 'webhook';
export const DISABLED_STATUS: Record<DisabledKind, number> = { checkout: 409, webhook: 503 };
const DEFAULT_ORIGIN = 'http://localhost:4200';
const nonEmpty = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

// Sin secretos ni valores de configuración en el cuerpo: idéntico al estado
// deshabilitado previo, para no cambiar el contrato de respuesta.
export function disabledResponse(kind: DisabledKind): Response {
  return kind === 'checkout'
    ? Response.json(
        { error: 'Compra no disponible' },
        { status: DISABLED_STATUS.checkout, headers: { 'Cache-Control': 'no-store', Vary: 'Origin' } },
      )
    : new Response(null, { status: DISABLED_STATUS.webhook });
}

export function loadCheckoutRuntime(env: EnvReader): CheckoutRuntime {
  const supabaseUrl = env('SUPABASE_URL');
  const supabaseServiceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = env('STRIPE_SECRET_KEY');
  const termsVersion = env('CHECKOUT_TERMS_VERSION');
  const gate = checkoutTestGate({
    checkoutEnabled: env('CHECKOUT_ENABLED'),
    checkoutMode: env('CHECKOUT_MODE'),
    stripeSecretKey,
    supabaseUrl,
    supabaseServiceRoleKey,
    termsVersion,
  });
  // Flag HTTP estrictamente de entorno: sólo el literal 'true' y únicamente
  // cuando la guarda TEST está abierta. Cualquier modo live, clave no-test o
  // configuración parcial lo deja en false aunque el flag esté presente.
  const allowHttpTestOrigin = gate.enabled && env('CHECKOUT_ALLOW_HTTP_TEST_ORIGIN') === 'true';
  return {
    gate,
    // Estos valores se pasan SOLO al controlador y a los clientes de servidor.
    // La validación de appOrigin/allowlist sigue siendo autoridad del handler.
    config: {
      origins: (env('CHECKOUT_ALLOWED_ORIGINS') ?? DEFAULT_ORIGIN).split(',').map(x => x.trim()).filter(Boolean),
      appOrigin: env('APP_ORIGIN') ?? DEFAULT_ORIGIN,
      termsVersion,
      allowHttpTestOrigin,
      supabaseUrl,
      supabaseServiceRoleKey,
      stripeSecretKey,
    },
  };
}

export function loadWebhookRuntime(env: EnvReader): WebhookRuntime {
  const supabaseUrl = env('SUPABASE_URL');
  const supabaseServiceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const stripeWebhookSecret = env('STRIPE_WEBHOOK_SECRET');
  // La clave Stripe es opcional para verificar: si existe debe ser de prueba real
  // (un placeholder en el entorno cierra la guarda, nunca la satisface).
  const stripeSecretKey = env('STRIPE_SECRET_KEY');
  const gate = webhookTestGate({
    webhookEnabled: env('STRIPE_WEBHOOK_ENABLED'),
    checkoutMode: env('CHECKOUT_MODE'),
    clientAvailable: nonEmpty(supabaseUrl) && nonEmpty(supabaseServiceRoleKey),
    stripeWebhookSecret,
    stripeSecretKey,
  });
  return { gate, config: { supabaseUrl, supabaseServiceRoleKey, stripeWebhookSecret, stripeSecretKey } };
}
