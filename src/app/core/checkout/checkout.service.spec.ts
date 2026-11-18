import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPABASE_CLIENT } from '../supabase/supabase-client';
import { canonicalAttemptId, checkoutOwnerHash } from './checkout';
import { CheckoutService } from './checkout.service';

const COURSE = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '55555555-5555-4555-8555-555555555555';
const URL = 'https://checkout.stripe.com/c/pay/cs_test_a1b2#fidkdWxOYHwn';

const legacyKey = `academia.checkout.recovery.${COURSE}`;
const keyFor = async (user: string) => `${legacyKey}.${await checkoutOwnerHash(user)}`;
const pair = (ownerHash: string | null, attemptId: string, sessionId: string) =>
  JSON.stringify({ ownerHash, attemptId, sessionId });

function setup(client: unknown, document?: unknown) {
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE_CLIENT, useValue: client },
      ...(document ? [{ provide: DOCUMENT, useValue: document }] : []),
    ],
  });
  return TestBed.inject(CheckoutService);
}

describe('CheckoutService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
  });

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

  it('guarda el par intento/sesión scopeado por dueño y lo reenvía en el reintento', async () => {
    const canonical = canonicalAttemptId(USER, COURSE);
    const owner = await checkoutOwnerHash(USER);
    const key = await keyFor(USER);
    const invoke = vi.fn().mockResolvedValue({
      data: { url: URL, sessionId: 'cs_test_session123', attemptId: canonical }, error: null,
    });
    const service = setup({ functions: { invoke } });

    await service.start(COURSE, USER);
    expect(invoke.mock.calls[0][1].body).toEqual({ courseId: COURSE, attemptId: canonical });
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
      ownerHash: owner, attemptId: canonical, sessionId: 'cs_test_session123',
    });
    expect(window.localStorage.getItem(key)).not.toContain(USER);
    await service.start(COURSE, USER);
    expect(invoke.mock.calls[1][1].body).toEqual({
      courseId: COURSE, attemptId: canonical, sessionId: 'cs_test_session123',
    });

    TestBed.resetTestingModule();
    const reloaded = setup({ functions: { invoke } });
    await reloaded.start(COURSE, USER);
    expect(invoke.mock.calls[2][1].body.sessionId).toBe('cs_test_session123');
  });

  it('tras una recuperación se reenvía el intento derivado, no el inicial', async () => {
    const canonical = canonicalAttemptId(USER, COURSE);
    const derived = '33333333-3333-4333-8333-333333333333';
    const invoke = vi.fn().mockResolvedValue({
      data: { url: URL, sessionId: 'cs_test_recovery', attemptId: derived }, error: null,
    });
    const service = setup({ functions: { invoke } });

    await service.start(COURSE, USER);
    await service.start(COURSE, USER);

    expect(invoke.mock.calls[0][1].body.attemptId).toBe(canonical);
    expect(invoke.mock.calls[1][1].body).toEqual({
      courseId: COURSE, attemptId: derived, sessionId: 'cs_test_recovery',
    });
  });

  it('instancia fresca de otra cuenta no reenvía la marca de A y puede comprar', async () => {
    const ownerA = await checkoutOwnerHash(USER);
    const ownerB = await checkoutOwnerHash(OTHER);
    window.localStorage.setItem(await keyFor(USER),
      pair(ownerA, canonicalAttemptId(USER, COURSE), 'cs_test_froma'));
    window.localStorage.setItem(legacyKey,
      pair(null, canonicalAttemptId(USER, COURSE), 'cs_test_legacy'));
    const invoke = vi.fn().mockResolvedValue({ data: { url: URL }, error: null });

    const b = setup({ functions: { invoke } });
    const result = await b.start(COURSE, OTHER);
    expect(result.kind).toBe('ok');
    expect(invoke).toHaveBeenCalledWith('create-checkout', {
      body: { courseId: COURSE, attemptId: canonicalAttemptId(OTHER, COURSE) },
    });
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
    expect(window.localStorage.getItem(await keyFor(USER)))
      .toBe(pair(ownerA, canonicalAttemptId(USER, COURSE), 'cs_test_froma'));

    TestBed.resetTestingModule();
    const a = setup({ functions: { invoke } });
    await a.start(COURSE, USER);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls.at(-1)![1].body.sessionId).toBe('cs_test_froma');
    expect(ownerB).not.toBe(ownerA);
  });

  it('misma curso, varias cuentas: cada una lee sólo su par y se aísla al salir', async () => {
    const invokeA = vi.fn().mockResolvedValue({
      data: { url: URL, sessionId: 'cs_test_a', attemptId: canonicalAttemptId(USER, COURSE) }, error: null,
    });
    const a = setup({ functions: { invoke: invokeA } });
    await a.start(COURSE, USER);
    await a.discardRecovery(COURSE, USER);
    expect(window.localStorage.getItem(await keyFor(USER))).toBeNull();

    TestBed.resetTestingModule();
    const invokeB = vi.fn().mockResolvedValue({
      data: { url: URL, sessionId: 'cs_test_b', attemptId: canonicalAttemptId(OTHER, COURSE) }, error: null,
    });
    const b = setup({ functions: { invoke: invokeB } });
    await b.start(COURSE, OTHER);
    await b.start(COURSE, OTHER);
    expect(invokeB.mock.calls[1][1].body.sessionId).toBe('cs_test_b');
    expect(window.localStorage.getItem(await keyFor(USER))).toBeNull();
  });

  it('owner manipulado, legado, corrupto o vacío: sin recuperación y sin bloquear la compra', async () => {
    const owner = await checkoutOwnerHash(USER);
    const scoped = await keyFor(USER);
    const invoke = vi.fn().mockResolvedValue({ data: { url: URL }, error: null });
    const badValues = [
      pair(await checkoutOwnerHash(OTHER), canonicalAttemptId(USER, COURSE), 'cs_test_forged'),
      'no-es-json',
      '',
      JSON.stringify({ ownerHash: owner, attemptId: 'no-uuid', sessionId: 'cs_test_x' }),
    ];
    for (const value of badValues) {
      window.localStorage.clear();
      window.localStorage.setItem(scoped, value);
      TestBed.resetTestingModule();
      const service = setup({ functions: { invoke } });
      expect((await service.start(COURSE, USER)).kind).toBe('ok');
      expect(invoke.mock.calls.at(-1)![1].body).toEqual({
        courseId: COURSE, attemptId: canonicalAttemptId(USER, COURSE),
      });
      expect(window.localStorage.getItem(scoped)).toBeNull();
    }
    window.localStorage.clear();
    window.localStorage.setItem(legacyKey, pair(null, canonicalAttemptId(USER, COURSE), 'cs_test_legacy'));
    TestBed.resetTestingModule();
    const legacyOnly = setup({ functions: { invoke } });
    expect((await legacyOnly.start(COURSE, USER)).kind).toBe('ok');
    expect(invoke.mock.calls.at(-1)![1].body).not.toHaveProperty('sessionId');
    expect(window.localStorage.getItem(legacyKey)).toBeNull();
  });

  it('almacenamiento que lanza excepciones: compra normal sin marca', async () => {
    const throwing = {
      getItem: () => { throw new Error('storage bloqueado'); },
      setItem: () => { throw new Error('storage bloqueado'); },
      removeItem: () => { throw new Error('storage bloqueado'); },
    };
    const invoke = vi.fn().mockResolvedValue({
      data: { url: URL, sessionId: 'cs_test_ignored' }, error: null,
    });
    const service = setup({ functions: { invoke } }, { defaultView: { localStorage: throwing } });

    expect((await service.start(COURSE, USER)).kind).toBe('ok');
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty('sessionId');
  });

  it('un fallo de estado no verificado conserva la marca scopeada', async () => {
    const stored = pair(await checkoutOwnerHash(USER), canonicalAttemptId(USER, COURSE), 'cs_test_session123');
    const key = await keyFor(USER);
    window.localStorage.setItem(key, stored);
    const invoke = vi.fn().mockResolvedValue({
      data: null, error: { context: { status: 422 } },
    });
    const service = setup({ functions: { invoke } });

    expect(await service.start(COURSE, USER)).toEqual({
      kind: 'failure', failure: { code: 'status-unknown', retryable: true },
    });
    expect(window.localStorage.getItem(key)).toBe(stored);
  });

  it('salir de cuenta con petición en vuelo no guarda la marca ni devuelve éxito', async () => {
    let resolve!: (value: unknown) => void;
    const invoke = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
    const service = setup({ functions: { invoke } });

    const pending = service.start(COURSE, USER);
    service.cancelPending(COURSE, USER);
    resolve({ data: { url: URL, sessionId: 'cs_test_stale' }, error: null });
    const result = await pending;

    expect(result.kind).toBe('failure');
    expect(window.localStorage.getItem(await keyFor(USER))).toBeNull();
  });
});
