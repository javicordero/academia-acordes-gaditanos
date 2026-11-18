import { describe, it, expect } from 'vitest';
import { checkoutTestGate, webhookTestGate, type CheckoutTestGateConfig, type WebhookTestGateConfig } from './test-gates';

// Valores íntegramente sintéticos, usados SOLO en esta spec. No son credenciales.
const TEST_PREFIX = 'sk_test_';
const TEST_KEY = 'sk_test_synthetic_fixture_9f3a';
const SIGNING_SECRET = 'whsec_synthetic_fixture_9f3a';

const checkout = (overrides: CheckoutTestGateConfig = {}): CheckoutTestGateConfig => ({
  checkoutEnabled: 'true',
  checkoutMode: 'test',
  stripeSecretKey: TEST_KEY,
  supabaseUrl: 'https://synthetic.invalid',
  supabaseServiceRoleKey: 'synthetic-service-role',
  termsVersion: 'synthetic-terms-v1',
  ...overrides,
});

const webhook = (overrides: WebhookTestGateConfig = {}): WebhookTestGateConfig => ({
  webhookEnabled: 'true',
  checkoutMode: 'test',
  stripeWebhookSecret: SIGNING_SECRET,
  clientAvailable: true,
  ...overrides,
});

const leaks = (value: unknown, secret: string): boolean => JSON.stringify(value).includes(secret);

describe('checkoutTestGate', () => {
  it('cierra por defecto y con configuración parcial', () => {
    expect(checkoutTestGate({})).toEqual({ enabled: false, reason: 'test_gate_closed' });
    expect(checkoutTestGate({ checkoutEnabled: 'true' })).toEqual({ enabled: false, reason: 'test_gate_closed' });
    expect(checkoutTestGate(checkout({ checkoutMode: undefined })).enabled).toBe(false);
    expect(checkoutTestGate(checkout({ stripeSecretKey: undefined })).enabled).toBe(false);
    expect(checkoutTestGate(checkout({ supabaseUrl: undefined })).enabled).toBe(false);
    expect(checkoutTestGate(checkout({ supabaseServiceRoleKey: '' })).enabled).toBe(false);
    expect(checkoutTestGate(checkout({ termsVersion: '   ' })).enabled).toBe(false);
  });

  it('sólo acepta flag literal true: rechaza 1, FALSE y false', () => {
    expect(checkoutTestGate(checkout({ checkoutEnabled: true })).enabled).toBe(true);
    for (const bad of ['1', 'TRUE', 'True', false, 1, 'true '] as unknown as string[]) {
      expect(checkoutTestGate(checkout({ checkoutEnabled: bad })).enabled).toBe(false);
    }
  });

  it('cierra en live o cualquier casing de modo, aunque los flags estén activos', () => {
    for (const mode of ['live', 'LIVE', 'TEST', 'Test', '', undefined]) {
      expect(checkoutTestGate(checkout({ checkoutMode: mode })).enabled).toBe(false);
    }
  });

  it('rechaza claves live, publishables, vacías, undefined y el placeholder del SDK', () => {
    for (const key of [
      'sk_live_synthetic', 'pk_test_synthetic', 'pk_live_synthetic',
      'sk_test_', 'undefined', 'sk_test_unused', undefined,
    ]) {
      expect(checkoutTestGate(checkout({ stripeSecretKey: key })).enabled).toBe(false);
    }
  });

  it('cierra con whitespace antes, después o dentro de la clave (sin recortar)', () => {
    const keys = [
      ` ${TEST_KEY}`, `${TEST_KEY} `, `${TEST_KEY}\n`,
      `${TEST_PREFIX} ${TEST_KEY.slice(TEST_PREFIX.length)}`,
    ];
    for (const key of keys) expect(checkoutTestGate(checkout({ stripeSecretKey: key })).enabled).toBe(false);
  });

  it('abre la rama TEST completa y no filtra valores', () => {
    const result = checkoutTestGate(checkout());
    expect(result).toEqual({ enabled: true, reason: 'ok' });
    expect(leaks(result, TEST_KEY)).toBe(false);
    const denied = checkoutTestGate(checkout({ stripeSecretKey: undefined }));
    expect(leaks(denied, 'synthetic-service-role')).toBe(false);
    expect(leaks(denied, 'synthetic-terms-v1')).toBe(false);
  });
});

describe('webhookTestGate', () => {
  it('cierra por defecto y si falta cliente o secreto de firma', () => {
    expect(webhookTestGate({})).toEqual({ enabled: false, reason: 'test_gate_closed', expectedLiveMode: false });
    expect(webhookTestGate(webhook({ clientAvailable: false })).enabled).toBe(false);
    expect(webhookTestGate(webhook({ clientAvailable: undefined })).enabled).toBe(false);
    expect(webhookTestGate(webhook({ stripeWebhookSecret: undefined })).enabled).toBe(false);
    expect(webhookTestGate(webhook({ stripeWebhookSecret: 'whsec_' })).enabled).toBe(false);
  });

  it('exige prefijo whsec_ y rechaza secretos de otro tipo', () => {
    for (const secret of [TEST_KEY, 'whsec', 'whsec_ ', 'sk_test_synthetic_fixture_9f3a']) {
      expect(webhookTestGate(webhook({ stripeWebhookSecret: secret })).enabled).toBe(false);
    }
  });

  it('admite guiones en el sufijo whsec y cierra con cualquier whitespace', () => {
    const dashed = 'whsec_synthetic-fixture_9f3a-abc';
    expect(webhookTestGate(webhook({ stripeWebhookSecret: dashed })).enabled).toBe(true);
    for (const secret of [
      ` ${dashed}`, `${dashed} `, `${dashed}\n`, 'whsec_synthetic fixture_9f3a', 'whsec_',
    ]) {
      expect(webhookTestGate(webhook({ stripeWebhookSecret: secret })).enabled).toBe(false);
    }
    expect(webhookTestGate(webhook({ stripeSecretKey: ` ${TEST_KEY}` })).enabled).toBe(false);
    expect(webhookTestGate(webhook({ stripeSecretKey: `${TEST_KEY} ` })).enabled).toBe(false);
  });

  it('sólo acepta flag literal true y modo test exacto', () => {
    expect(webhookTestGate(webhook({ webhookEnabled: true })).enabled).toBe(true);
    for (const flag of ['1', 'TRUE', false, 1] as unknown as string[]) {
      expect(webhookTestGate(webhook({ webhookEnabled: flag })).enabled).toBe(false);
    }
    for (const mode of ['live', 'LIVE', 'TEST', undefined]) {
      expect(webhookTestGate(webhook({ checkoutMode: mode })).enabled).toBe(false);
    }
  });

  it('rechaza el placeholder si se pasa por error, sin exigir clave para firmar', () => {
    expect(webhookTestGate(webhook({ stripeSecretKey: 'sk_test_unused' })).enabled).toBe(false);
    expect(webhookTestGate(webhook({ stripeSecretKey: TEST_KEY })).enabled).toBe(true);
    expect(webhookTestGate(webhook({ stripeSecretKey: 'sk_live_synthetic' })).enabled).toBe(false);
    expect(webhookTestGate(webhook()).enabled).toBe(true);
  });

  it('fija expectedLiveMode en false y no filtra secretos', () => {
    const result = webhookTestGate(webhook());
    expect(result).toEqual({ enabled: true, reason: 'ok', expectedLiveMode: false });
    // Un intento de forzar el modo desde config no altera la salida.
    const forced = webhookTestGate({ ...webhook(), expectedLiveMode: true } as WebhookTestGateConfig);
    expect(forced.expectedLiveMode).toBe(false);
    expect(leaks(result, SIGNING_SECRET)).toBe(false);
    expect(leaks(result, TEST_KEY)).toBe(false);
    expect(leaks(forced, SIGNING_SECRET)).toBe(false);
  });
});
