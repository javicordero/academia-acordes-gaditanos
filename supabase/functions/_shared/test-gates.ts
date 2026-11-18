// Guardas técnicas de SOLO PRUEBAS para decidir, desde configuración explícita,
// si una Edge Function puede arrancar en modo test. No lee Deno.env, no escribe
// logs y no devuelve valores de configuración: la salida es siempre genérica.
//
// Este módulo NO habilita nada por sí mismo: el index FUTURO que lo importe
// seguirá siendo el único que lee secretos y el que decide el arranque. Tampoco
// sustituye la verificación de firma, raw body, RLS, permisos, importes ni la
// validación de appOrigin/allowlist, que ya viven en los handlers actuales.
//
// Autoridad legal fuera del helper: comprobar que termsVersion existe NO es
// aprobar sus términos. El valor definitivo lo fija el promotor en la BD.

export type CheckoutTestGateConfig = {
  checkoutEnabled?: string | boolean;
  checkoutMode?: string;
  stripeSecretKey?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  termsVersion?: string;
};

export type WebhookTestGateConfig = {
  webhookEnabled?: string | boolean;
  checkoutMode?: string;
  stripeWebhookSecret?: string;
  stripeSecretKey?: string;
  clientAvailable?: boolean;
};

export type GateReason = 'ok' | 'test_gate_closed';
export type CheckoutTestGate = { enabled: boolean; reason: GateReason };
export type WebhookTestGate = { enabled: boolean; reason: GateReason; expectedLiveMode: false };

const TRUE = 'true';
const TEST_MODE = 'test';
const CLOSED: GateReason = 'test_gate_closed';
const TEST_PREFIX = 'sk_test_';
const SIGNING_PREFIX = 'whsec_';
// Placeholder del SDK usado hoy sólo como proveedor cripto en stripe-webhook:
// si se pasa por error como configuración, la guarda se cierra igualmente.
const PLACEHOLDER_KEYS = new Set(['sk_test_unused']);

// Contrato estricto: sólo el string 'true' o el booleano true. '1', 'TRUE',
// 1, false o ausente FAIL CLOSED.
const flagOn = (value: string | boolean | undefined): boolean => value === true || value === TRUE;
// Cualquier modo ausente, 'live' u otra casing se cierra.
const isTestMode = (value: string | undefined): boolean => value === TEST_MODE;
const present = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;
// Sin recortar: el SDK recibe el valor original, así que cualquier whitespace
// (incluido uno final) cierra la guarda. Sólo se exige prefijo y sufijo no vacío;
// la forma criptográfica la valida Stripe, no este helper.
const validSecret = (value: string | undefined, prefix: string): value is string =>
  typeof value === 'string' && !/\s/.test(value) && value.startsWith(prefix) && value.length > prefix.length;
const validTestKey = (value: string | undefined): boolean =>
  validSecret(value, TEST_PREFIX) && !PLACEHOLDER_KEYS.has(value);

export function checkoutTestGate(config: CheckoutTestGateConfig): CheckoutTestGate {
  const ready =
    flagOn(config.checkoutEnabled) &&
    isTestMode(config.checkoutMode) &&
    validTestKey(config.stripeSecretKey) &&
    present(config.supabaseUrl) &&
    present(config.supabaseServiceRoleKey) &&
    present(config.termsVersion);
  return ready ? { enabled: true, reason: 'ok' } : { enabled: false, reason: CLOSED };
}

export function webhookTestGate(config: WebhookTestGateConfig): WebhookTestGate {
  const signingOk = validSecret(config.stripeWebhookSecret, SIGNING_PREFIX);
  // El webhook firma con whsec_; la clave Stripe es opcional, pero si se pasa
  // debe ser una clave de prueba real (nunca el placeholder del SDK).
  const key = config.stripeSecretKey;
  const keyOk = key === undefined || validTestKey(key);
  const ready =
    flagOn(config.webhookEnabled) &&
    isTestMode(config.checkoutMode) &&
    config.clientAvailable === true &&
    signingOk &&
    keyOk;
  return ready
    ? { enabled: true, reason: 'ok', expectedLiveMode: false }
    : { enabled: false, reason: CLOSED, expectedLiveMode: false };
}
