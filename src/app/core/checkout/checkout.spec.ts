import { describe, expect, it, vi } from 'vitest';

import { readCheckoutTestFlag } from '../../../environments/supabase-config';
import {
  canonicalAttemptId,
  checkoutOwnerHash,
  checkoutErrorMessage,
  classifyCheckoutError,
  isCheckoutSessionId,
  isCheckoutUuid,
  isSafeCheckoutUrl,
} from './checkout';

const VALID = 'https://checkout.stripe.com/c/pay/cs_test_a1b2#fidkdWxOYHwn';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '55555555-5555-4555-8555-555555555555';
const COURSE = '22222222-2222-4222-8222-222222222222';

describe('flag público de compra TEST', () => {
  it('solo se activa con true literal; por defecto está apagado', () => {
    expect(readCheckoutTestFlag({})).toBe(false);
    expect(readCheckoutTestFlag({ checkoutTestEnabled: false })).toBe(false);
    expect(readCheckoutTestFlag({ checkoutTestEnabled: 'true' })).toBe(false);
    expect(readCheckoutTestFlag({ checkoutTestEnabled: true })).toBe(true);
  });
});

describe('validación de la URL de Stripe', () => {
  it('acepta la URL real con path y hash', () => {
    expect(isSafeCheckoutUrl(VALID)).toBe(true);
  });

  it('rechaza http, hosts lookalike, credenciales y puertos alternativos', () => {
    for (const value of [
      'http://checkout.stripe.com/c/pay/cs_test_a1b2',
      'https://checkout.stripe.com.evil.test/c/pay/cs_test',
      'https://checkout.stripe.com@evil.test/c/pay/cs_test',
      'https://user:pass@checkout.stripe.com/c/pay/cs_test',
      'https://checkout.stripe.com:8443/c/pay/cs_test',
      'https://www.checkout.stripe.com/c/pay/cs_test',
      'https://checkout.stripe.com.evil/c/pay/cs_test',
      'javascript:alert(1)',
      '',
      42,
      null,
    ]) {
      expect(isSafeCheckoutUrl(value)).toBe(false);
    }
  });
});

describe('seudónimo local de identidad', () => {
  it('es estable, distinto por cuenta y nunca contiene el id en claro', () => {
    const first = checkoutOwnerHash(USER);
    const other = checkoutOwnerHash(OTHER);
    expect(first).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(checkoutOwnerHash(USER)).toBe(first);
    expect(other).not.toBe(first);
    expect(first).not.toContain(USER);
    expect(first).not.toContain('11111111');
  });

  it('funciona en HTTP no seguro: crypto sin subtle y randomUUID cambiante', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: <T extends ArrayBufferView>(array: T) => array,
      randomUUID: () => `random-${Math.random()}`,
    });
    try {
      expect((globalThis.crypto as { subtle?: unknown }).subtle).toBeUndefined();
      expect(checkoutOwnerHash(USER)).toBe(checkoutOwnerHash(USER));
      expect(checkoutOwnerHash(USER)).not.toBe(checkoutOwnerHash(OTHER));
      expect(canonicalAttemptId(USER, COURSE)).toBe('9467a46f-a670-5c98-987a-82225fcff2c8');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('identificador opaco de sesión', () => {
  it('sólo acepta ids de sesión de Stripe con forma válida', () => {
    expect(isCheckoutSessionId('cs_test_session123')).toBe(true);
    expect(isCheckoutSessionId('cs_live_session123')).toBe(true);
    for (const value of ['cs_test_', 'cs_test_bad id', 'pi_test_1', 'https://checkout.stripe.com/x', '', null]) {
      expect(isCheckoutSessionId(value)).toBe(false);
    }
  });
});

describe('intento canónico', () => {
  it('es un UUID válido, estable y distinto por curso o identidad', () => {
    const u = '11111111-1111-4111-8111-111111111111';
    const c = '22222222-2222-4222-8222-222222222222';
    const first = canonicalAttemptId(u, c);
    // Vector conocido ANTES y DESPUÉS de extraer el helper puro: la clave de
    // idempotencia de los intentos ya emitidos no puede cambiar.
    expect(first).toBe('9467a46f-a670-5c98-987a-82225fcff2c8');
    expect(canonicalAttemptId(OTHER, COURSE)).toBe('979f4947-88ab-5e08-988d-fc91c5caefb4');
    expect(isCheckoutUuid(first)).toBe(true);
    expect(canonicalAttemptId(u, c)).toBe(first);
    expect(canonicalAttemptId(u.toUpperCase(), c.toUpperCase())).toBe(first);
    expect(canonicalAttemptId(u, '33333333-3333-4333-8333-333333333333')).not.toBe(first);
    expect(canonicalAttemptId('44444444-4444-4444-8444-444444444444', c)).not.toBe(first);
  });
});

describe('errores controlados', () => {
  it('clasifica los códigos del servidor y los errores de red', () => {
    expect(classifyCheckoutError({ context: { status: 401 } }).code).toBe('login');
    expect(classifyCheckoutError({ context: { status: 403 } }).code).toBe('forbidden');
    expect(classifyCheckoutError({ context: { status: 409 } })).toEqual({
      code: 'unavailable',
      retryable: false,
    });
    expect(classifyCheckoutError({ context: { status: 422 } })).toEqual({
      code: 'status-unknown',
      retryable: true,
    });
    expect(classifyCheckoutError(new Error('Failed to fetch')).code).toBe('network');
    expect(classifyCheckoutError(new Error('otro')).code).toBe('unknown');
  });

  it('da mensajes en español y no habilita reintento para 409', () => {
    expect(checkoutErrorMessage({ code: 'unavailable', retryable: false }))
      .toContain('no está disponible');
    const forbidden = checkoutErrorMessage({ code: 'forbidden', retryable: false });
    expect(forbidden).toContain('No se pudo autorizar la compra');
    expect(forbidden).not.toContain('Confirma tu correo');
    expect(checkoutErrorMessage({ code: 'network', retryable: true }))
      .toContain('conectar');
    expect(checkoutErrorMessage({ code: 'status-unknown', retryable: true }))
      .toContain('No se pudo confirmar el estado');
  });
});
