import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPABASE_CLIENT } from '../supabase/supabase-client';
import { canonicalAttemptId } from './checkout';
import { CheckoutService } from './checkout.service';

const COURSE = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const URL = 'https://checkout.stripe.com/c/pay/cs_test_a1b2#fidkdWxOYHwn';

function setup(client: unknown) {
  TestBed.configureTestingModule({
    providers: [{ provide: SUPABASE_CLIENT, useValue: client }],
  });
  return TestBed.inject(CheckoutService);
}

describe('CheckoutService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('usa functions.invoke con el body canónico y la sesión del SDK', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { url: URL }, error: null });
    const service = setup({ functions: { invoke } });

    const result = await service.start(COURSE, USER);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('create-checkout', {
      body: { courseId: COURSE, attemptId: canonicalAttemptId(USER, COURSE) },
    });
    expect(result).toEqual({ kind: 'ok', url: URL });
  });

  it('no duplica la llamada por doble clic y reutiliza el intento al reintentar', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { url: URL }, error: null });
    const service = setup({ functions: { invoke } });

    const [first, second] = await Promise.all([
      service.start(COURSE, USER),
      service.start(COURSE, USER),
    ]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);

    const retry = await service.start(COURSE, USER);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1].body.attemptId).toBe(invoke.mock.calls[0][1].body.attemptId);
    expect(retry).toEqual({ kind: 'ok', url: URL });
  });

  it('un intento distinto por cuenta o curso no reutiliza el anterior', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { url: URL }, error: null });
    const service = setup({ functions: { invoke } });

    await service.start(COURSE, USER);
    await service.start(COURSE, '55555555-5555-4555-8555-555555555555');

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1].body.attemptId).not.toBe(invoke.mock.calls[1][1].body.attemptId);
  });

  it('no devuelve éxito con una URL inválida o ausente', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { url: 'https://checkout.stripe.com.evil.test/x' }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });
    const service = setup({ functions: { invoke } });

    expect((await service.start(COURSE, USER)).kind).toBe('failure');
    expect((await service.start(COURSE, USER)).kind).toBe('failure');
  });

  it('traduce los estados del servidor sin redirigir', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: { context: { status: 409 } },
    });
    const service = setup({ functions: { invoke } });

    expect(await service.start(COURSE, USER)).toEqual({
      kind: 'failure',
      failure: { code: 'unavailable', retryable: false },
    });
  });

  it('sin cliente configurado no intenta comprar', async () => {
    const service = setup(null);
    expect(await service.start(COURSE, USER)).toEqual({
      kind: 'failure',
      failure: { code: 'unavailable', retryable: false },
    });
  });
});
