import { describe, it, expect } from 'vitest';
import { DISABLED_STATUS, disabledResponse, loadCheckoutRuntime, loadWebhookRuntime, type EnvReader } from './test-gate-env';

// Fixtures íntegramente sintéticas: nunca credenciales reales ni valores de cuenta.
const KEY = 'sk_test_synthetic_fixture_9f3a';
const WHSEC = 'whsec_synthetic-fixture_9f3a-abc';
const envOf = (values: Record<string, string | undefined> = {}): EnvReader => (name) => values[name];

const checkoutEnv = (overrides: Record<string, string | undefined> = {}) => ({
  CHECKOUT_ENABLED: 'true',
  CHECKOUT_MODE: 'test',
  STRIPE_SECRET_KEY: KEY,
  SUPABASE_URL: 'https://synthetic.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
  CHECKOUT_TERMS_VERSION: 'synthetic-terms-v1',
  ...overrides,
});
const webhookEnv = (overrides: Record<string, string | undefined> = {}) => ({
  STRIPE_WEBHOOK_ENABLED: 'true',
  CHECKOUT_MODE: 'test',
  SUPABASE_URL: 'https://synthetic.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
  STRIPE_WEBHOOK_SECRET: WHSEC,
  ...overrides,
});

describe('wiring de entorno del checkout', () => {
  it('cierra por defecto con el estado deshabilitado existente', async () => {
    const runtime = loadCheckoutRuntime(envOf());
    expect(runtime.gate).toEqual({ enabled: false, reason: 'test_gate_closed' });
    const res = disabledResponse('checkout');
    expect(res.status).toBe(DISABLED_STATUS.checkout);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Compra no disponible' });
  });

  it('sólo lee variables de entorno con los nombres exactos del contrato', () => {
    expect(loadCheckoutRuntime(envOf(checkoutEnv())).gate.enabled).toBe(true);
    expect(loadCheckoutRuntime(envOf(checkoutEnv({ CHECKOUT_ENABLED: undefined }))).gate.enabled).toBe(false);
    expect(loadCheckoutRuntime(envOf(checkoutEnv({ CHECKOUT_ENABLED: '1' }))).gate.enabled).toBe(false);
    expect(loadCheckoutRuntime(envOf(checkoutEnv({ CHECKOUT_MODE: 'live' }))).gate.enabled).toBe(false);
    expect(loadCheckoutRuntime(envOf(checkoutEnv({ CHECKOUT_TERMS_VERSION: undefined }))).gate.enabled).toBe(false);
    // Un objeto parecido a una petición no puede suplir al entorno.
    expect(loadCheckoutRuntime(envOf({ body: checkoutEnv() })).gate.enabled).toBe(false);
    const runtime = loadCheckoutRuntime(envOf(checkoutEnv()));
    expect(runtime.config.stripeSecretKey).toBe(KEY);
    expect(runtime.config.termsVersion).toBe('synthetic-terms-v1');
  });

  it('el placeholder del SDK nunca habilita y la salida cerrada no filtra valores', async () => {
    const runtime = loadCheckoutRuntime(envOf(checkoutEnv({ STRIPE_SECRET_KEY: 'sk_test_unused' })));
    expect(runtime.gate.enabled).toBe(false);
    expect(await (await disabledResponse('checkout')).text()).not.toContain(KEY);
  });

  it('flag HTTP: literal true exacto y sólo con guarda TEST abierta', () => {
    const open = loadCheckoutRuntime(envOf(checkoutEnv({ CHECKOUT_ALLOW_HTTP_TEST_ORIGIN: 'true' })));
    expect(open.gate.enabled).toBe(true);
    expect(open.config.allowHttpTestOrigin).toBe(true);
    for (const bad of ['1', 'TRUE', 'true ', undefined]) {
      expect(loadCheckoutRuntime(envOf(checkoutEnv({ CHECKOUT_ALLOW_HTTP_TEST_ORIGIN: bad }))).config.allowHttpTestOrigin).toBe(false);
    }
    const closed = [
      checkoutEnv({ CHECKOUT_ALLOW_HTTP_TEST_ORIGIN: 'true', CHECKOUT_MODE: 'live' }),
      checkoutEnv({ CHECKOUT_ALLOW_HTTP_TEST_ORIGIN: 'true', CHECKOUT_MODE: undefined }),
      checkoutEnv({ CHECKOUT_ALLOW_HTTP_TEST_ORIGIN: 'true', STRIPE_SECRET_KEY: 'sk_live_synthetic' }),
      checkoutEnv({ CHECKOUT_ALLOW_HTTP_TEST_ORIGIN: 'true', CHECKOUT_ENABLED: undefined }),
      checkoutEnv({ CHECKOUT_ALLOW_HTTP_TEST_ORIGIN: 'true', CHECKOUT_TERMS_VERSION: undefined }),
    ];
    for (const values of closed) {
      const runtime = loadCheckoutRuntime(envOf(values));
      expect(runtime.gate.enabled).toBe(false);
      expect(runtime.config.allowHttpTestOrigin).toBe(false);
    }
    // Una clave parecida a petición/cliente no puede suplir al entorno.
    expect(loadCheckoutRuntime(envOf({ ...checkoutEnv(), allowHttpTestOrigin: 'true' })).config.allowHttpTestOrigin).toBe(false);
  });
});

describe('wiring de entorno del webhook', () => {
  it('cierra por defecto con el estado deshabilitado existente', async () => {
    expect(loadWebhookRuntime(envOf()).gate.enabled).toBe(false);
    const res = disabledResponse('webhook');
    expect(res.status).toBe(DISABLED_STATUS.webhook);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain(WHSEC);
  });

  it('puede activarse en TEST sin checkout ni términos', () => {
    const runtime = loadWebhookRuntime(envOf(webhookEnv()));
    expect(runtime.gate).toEqual({ enabled: true, reason: 'ok', expectedLiveMode: false });
    expect(loadCheckoutRuntime(envOf(webhookEnv())).gate.enabled).toBe(false);
  });

  it('valores desde entorno: whsec con guiones sí, sin sufijo o modo live no', () => {
    expect(loadWebhookRuntime(envOf(webhookEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_' }))).gate.enabled).toBe(false);
    expect(loadWebhookRuntime(envOf(webhookEnv({ STRIPE_WEBHOOK_SECRET: ` ${WHSEC}` }))).gate.enabled).toBe(false);
    expect(loadWebhookRuntime(envOf(webhookEnv({ CHECKOUT_MODE: 'LIVE' }))).gate.enabled).toBe(false);
    expect(loadWebhookRuntime(envOf(webhookEnv({ STRIPE_WEBHOOK_ENABLED: 'true ' }))).gate.enabled).toBe(false);
    expect(loadWebhookRuntime(envOf(webhookEnv())).config.stripeWebhookSecret).toBe(WHSEC);
  });

  it('placeholder y env de liveMode no habilitan ni cambian expectedLiveMode', () => {
    expect(loadWebhookRuntime(envOf(webhookEnv({ STRIPE_SECRET_KEY: 'sk_test_unused' }))).gate.enabled).toBe(false);
    const forced = loadWebhookRuntime(envOf(webhookEnv({ EXPECTED_LIVE_MODE: 'true' }))).gate;
    expect(forced.expectedLiveMode).toBe(false);
    expect(forced.enabled).toBe(true);
  });
});
