import { describe, expect, it } from 'vitest';

import { readCheckoutTestFlag } from '../../../environments/supabase-config';
import {
  canonicalAttemptId,
  checkoutErrorMessage,
  classifyCheckoutError,
  isCheckoutUuid,
  isSafeCheckoutUrl,
} from './checkout';

const VALID = 'https://checkout.stripe.com/c/pay/cs_test_a1b2#fidkdWxOYHwn';

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

describe('intento canónico', () => {
  it('es un UUID válido, estable y distinto por curso o identidad', () => {
    const u = '11111111-1111-4111-8111-111111111111';
    const c = '22222222-2222-4222-8222-222222222222';
    const first = canonicalAttemptId(u, c);
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
  });
});
