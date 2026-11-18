import { describe, expect, it, vi } from 'vitest';
import { canonicalAttemptId } from './attempt';

// Mismos fixtures y vectores que src/app/core/checkout/checkout.spec.ts. Si
// cliente y servidor divergen, estos ejemplos fallan antes que un cobro.
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '55555555-5555-4555-8555-555555555555';
const COURSE = '22222222-2222-4222-8222-222222222222';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('intento canónico del servidor', () => {
  it('replica los vectores conocidos del cliente exactamente', () => {
    expect(canonicalAttemptId(USER, COURSE)).toBe('9467a46f-a670-5c98-987a-82225fcff2c8');
    expect(canonicalAttemptId(OTHER, COURSE)).toBe('979f4947-88ab-5e08-988d-fc91c5caefb4');
  });

  it('es un UUID válido, estable y sensible a mayúsculas de forma idéntica al cliente', () => {
    const first = canonicalAttemptId(USER, COURSE);
    expect(first).toMatch(UUID);
    expect(canonicalAttemptId(USER, COURSE)).toBe(first);
    expect(canonicalAttemptId(USER.toUpperCase(), COURSE.toUpperCase())).toBe(first);
    expect(canonicalAttemptId(USER, '33333333-3333-4333-8333-333333333333')).not.toBe(first);
    expect(canonicalAttemptId('44444444-4444-4444-8444-444444444444', COURSE)).not.toBe(first);
  });

  it('no depende de WebCrypto: funciona aunque falte crypto.subtle', () => {
    vi.stubGlobal('crypto', {});
    try {
      expect((globalThis.crypto as { subtle?: unknown }).subtle).toBeUndefined();
      expect(canonicalAttemptId(USER, COURSE)).toBe('9467a46f-a670-5c98-987a-82225fcff2c8');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
