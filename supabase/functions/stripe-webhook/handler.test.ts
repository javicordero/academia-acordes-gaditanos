// Mocks puros de E/S; el SDK de Stripe se usa de verdad sólo para firmar y
// verificar un fixture sintético. No es Supabase ni Stripe real: sin red,
// sin claves reales y sin datos personales.
import { describe, it, expect, vi } from 'vitest';
import Stripe from 'stripe';
import { SQL_INT_MAX, makeHandler, type Fulfillment, type Recorded } from './handler';
import { createDependencies } from './adapter';

const stripe = new Stripe('sk_test_unused');
const secret = 'whsec_synthetic_fixture_only';
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const verify = (body: Uint8Array, signature: string, s: string) =>
  stripe.webhooks.constructEventAsync(body, signature, s, 300, cryptoProvider);
const ORDER = '12345678-1234-1234-1234-123456789abc';
const USER = '00000000-0000-0000-0000-0000000000aa';
const base = {
  id: 'evt_123', type: 'checkout.session.completed', livemode: false,
  data: { object: {
    id: 'cs_test_123', mode: 'payment', payment_status: 'paid',
    amount_total: 12345, currency: 'eur', total_details: { amount_tax: 1234 },
    metadata: { order_id: ORDER }, note: 'guitarra ñ',
  } },
};
const withObject = (patch: Record<string, unknown>) => ({ ...base, data: { object: { ...base.data.object, ...patch } } });
const baseFacts = {
  eventId: 'evt_123', orderId: ORDER, sessionId: 'cs_test_123', userId: USER,
  amountMinor: 12345, currency: 'eur', taxMinor: 1234 as number | null,
};

type Options = {
  recorded?: Recorded; known?: boolean; result?: Fulfillment; failFulfill?: boolean;
  reservation?: 'pending' | 'unresolvable' | null; failReservation?: boolean;
  dbAmount?: number; dbCurrency?: string;
};
function setup(o: Options = {}) {
  const record = vi.fn().mockResolvedValue(o.recorded ?? 'created');
  const order = vi.fn().mockResolvedValue({
    known: o.known ?? true, userId: USER,
    amountMinor: o.dbAmount ?? 12345, currency: o.dbCurrency ?? 'EUR',
  });
  const reservation = vi.fn().mockResolvedValue(o.reservation === undefined ? 'unresolvable' : o.reservation);
  if (o.failReservation) reservation.mockRejectedValue(new Error('private diagnostic'));
  const fulfill = vi.fn().mockResolvedValue(o.result ?? 'fulfilled');
  if (o.failFulfill) fulfill.mockRejectedValue(new Error('private diagnostic'));
  const deps = { verify: vi.fn(verify), record, order, reservation, fulfill };
  const handler = makeHandler(deps, { enabled: true, secret, expectedLiveMode: false });
  return { record, order, reservation, fulfill, deps, handler };
}
function request(event: unknown = base, timestamp = Math.floor(Date.now() / 1000), change?: (s: string) => string) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
  return new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: change ? change(payload) : payload });
}

describe('webhook Stripe (mocks: no es Supabase/Stripe real)', () => {
  it('verifica firma SDK real y registra sólo hash y datos mínimos', async () => {
    const { handler, record, fulfill } = setup();
    expect((await handler(request())).status).toBe(200);
    expect(record).toHaveBeenCalledOnce();
    const args = record.mock.calls[0][0];
    expect(args.eventId).toBe('evt_123');
    expect(args.orderId).toBe(ORDER);
    expect(args.sessionId).toBe('cs_test_123');
    expect(args.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain('guitarra');
    expect(fulfill).toHaveBeenCalledOnce();
  });

  it('rechaza alteración, ausencia de firma y fechas fuera de tolerancia sin escribir', async () => {
    const { handler, record, fulfill, deps } = setup();
    expect((await handler(request(base, undefined, p => p.replace('guitarra', 'otra')))).status).toBe(400);
    expect((await handler(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base) }))).status).toBe(400);
    const now = Math.floor(Date.now() / 1000);
    expect((await handler(request(base, now - 301))).status).toBe(400);
    expect((await handler(request(base, now + 301))).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
    expect(fulfill).not.toHaveBeenCalled();
    expect(deps.verify).toHaveBeenCalledTimes(3);
  });

  it('bloqueo y secreto ausente cierran antes de verificar o escribir', async () => {
    const { deps, record, fulfill } = setup();
    expect((await makeHandler(deps, { enabled: false, secret, expectedLiveMode: false })(request())).status).toBe(503);
    expect((await makeHandler(deps, { enabled: true, expectedLiveMode: false })(request())).status).toBe(503);
    expect(deps.verify).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(fulfill).not.toHaveBeenCalled();
  });

  it('estado de pago distinto, modo distinto y tipo no soportado: 200 sin fulfill', async () => {
    for (const event of [withObject({ payment_status: 'unpaid' }), withObject({ mode: 'subscription' }), { ...base, type: 'charge.refunded' }]) {
      const { handler, record, fulfill } = setup();
      expect((await handler(request(event))).status).toBe(200);
      expect(record).not.toHaveBeenCalled();
      expect(fulfill).not.toHaveBeenCalled();
    }
  });

  it('livemode=true con expectedLiveMode=false: 400 sin fulfill', async () => {
    const { handler, fulfill, record } = setup();
    expect((await handler(request({ ...base, livemode: true }))).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
    expect(fulfill).not.toHaveBeenCalled();
  });

  it('order_id ausente o inválido en evento pagado: 400 sin fulfill', async () => {
    for (const metadata of [{ order_id: 'no-uuid' }, {}, null]) {
      const { handler, record, fulfill } = setup();
      expect((await handler(request(withObject({ metadata })))).status).toBe(400);
      expect(record).not.toHaveBeenCalled();
      expect(fulfill).not.toHaveBeenCalled();
    }
  });

  it('importe y moneda AUSENTES o con forma inválida: 400 sin recibo ni fulfill', async () => {
    for (const patch of [
      { amount_total: undefined }, { currency: undefined },
      { amount_total: -1 }, { amount_total: 1.5 }, { amount_total: '100' },
      { amount_total: SQL_INT_MAX + 1 }, { currency: 'euros' },
    ]) {
      const event = withObject(patch);
      if (patch.amount_total === undefined) delete (event.data.object as any).amount_total;
      if (patch.currency === undefined) delete (event.data.object as any).currency;
      const { handler, record, fulfill } = setup();
      expect((await handler(request(event))).status).toBe(400);
      expect(record).not.toHaveBeenCalled();
      expect(fulfill).not.toHaveBeenCalled();
    }
  });

  it('impuesto ausente, null o cero: checkout válido sin estimar impuestos', async () => {
    for (const [patch, expected] of [
      [{ total_details: undefined }, null],
      [{ total_details: null }, null],
      [{ total_details: {} }, null],
      [{ total_details: { amount_tax: null } }, null],
      [{ total_details: { amount_tax: 0 } }, 0],
      [{ total_details: { amount_tax: 1234, amount_subtotal: 11111 } }, 1234],
    ] as const) {
      const event = withObject(patch as Record<string, unknown>);
      if ((patch as any).total_details === undefined) delete (event.data.object as any).total_details;
      const { handler, fulfill } = setup();
      expect((await handler(request(event))).status).toBe(200);
      expect(fulfill).toHaveBeenCalledWith({
        eventId: 'evt_123', orderId: ORDER, sessionId: 'cs_test_123', userId: USER,
        amountMinor: 12345, currency: 'eur', taxMinor: expected,
      });
    }
  });

  it('impuesto malformado o fuera de integer: 400 sin registro ni fulfillment', async () => {
    for (const patch of [
      { total_details: { amount_tax: -1 } }, { total_details: { amount_tax: 1.5 } },
      { total_details: { amount_tax: '1234' } }, { total_details: { amount_tax: 12346 } },
      { total_details: { amount_tax: SQL_INT_MAX + 1 } },
    ]) {
      const { handler, fulfill, record } = setup();
      expect((await handler(request(withObject(patch)))).status).toBe(400);
      expect(record).not.toHaveBeenCalled();
      expect(fulfill).not.toHaveBeenCalled();
    }
  });

  it('importe e impuesto en el máximo de integer se aceptan sin recorte', async () => {
    const ok = setup({ dbAmount: SQL_INT_MAX });
    const maxEvent = withObject({ amount_total: SQL_INT_MAX, total_details: { amount_tax: SQL_INT_MAX } });
    expect((await ok.handler(request(maxEvent))).status).toBe(200);
    expect(ok.fulfill).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: SQL_INT_MAX, taxMinor: SQL_INT_MAX, currency: 'eur',
    }));

  });

  it('duplicado ya processed: 200 sin segunda llamada a fulfillment', async () => {
    const { handler, record, order, fulfill } = setup({ recorded: 'processed' });
    expect((await handler(request())).status).toBe(200);
    expect(record).toHaveBeenCalledOnce();
    expect(order).not.toHaveBeenCalled();
    expect(fulfill).not.toHaveBeenCalled();
  });

  it('fulfill recibe exactamente importe, moneda, impuesto, sesión, pedido y usuario de la BD', async () => {
    const { handler, fulfill } = setup();
    expect((await handler(request())).status).toBe(200);
    expect(fulfill).toHaveBeenCalledWith({
      eventId: 'evt_123', orderId: ORDER, sessionId: 'cs_test_123', userId: USER,
      amountMinor: 12345, currency: 'eur', taxMinor: 1234,
    });
  });

  it('pedido no elegible o reserva imposible: 200 ACK sin fulfillment', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { handler, fulfill, reservation, record } = setup({ known: false });
      expect((await handler(request())).status).toBe(200);
      expect(reservation).toHaveBeenCalledWith(ORDER, 'cs_test_123', 12345, 'EUR');
      expect(fulfill).not.toHaveBeenCalled();
      expect(record).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(JSON.stringify({ webhook: 'stripe', status: 200, eventId: 'evt_123', reason: 'missing_order' }));

      const without = setup({ known: false });
      delete (without.deps as any).reservation;
      expect((await without.handler(request())).status).toBe(200);
      expect(without.fulfill).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it('reserva propia sin bind: 503 reintentable, sin concesión ni procesado', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { handler, fulfill, reservation, record } = setup({ known: false, reservation: 'pending' });
      expect((await handler(request())).status).toBe(503);
      expect(reservation).toHaveBeenCalledOnce();
      expect(fulfill).not.toHaveBeenCalled();
      expect(record).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(JSON.stringify({ webhook: 'stripe', status: 503, eventId: 'evt_123', reason: 'unbound_session' }));
    } finally { spy.mockRestore(); }
  });

  it('mismo evento: pre-bind 503 y, tras bind, received_unprocessed se procesa una vez', async () => {
    const record = vi.fn()
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('received_unprocessed');
    const order = vi.fn()
      .mockResolvedValueOnce({ known: false, userId: null, amountMinor: null, currency: null })
      .mockResolvedValueOnce({ known: true, userId: USER, amountMinor: 12345, currency: 'EUR' });
    const reservation = vi.fn().mockResolvedValue('pending');
    const fulfill = vi.fn().mockResolvedValue('fulfilled');
    const deps = { verify: vi.fn(verify), record, order, reservation, fulfill };
    const handler = makeHandler(deps, { enabled: true, secret, expectedLiveMode: false });
    expect((await handler(request())).status).toBe(503);
    expect(reservation).toHaveBeenCalledOnce();
    expect(fulfill).not.toHaveBeenCalled();
    expect((await handler(request())).status).toBe(200);
    expect(record).toHaveBeenCalledTimes(2);
    expect(reservation).toHaveBeenCalledOnce();
    expect(fulfill).toHaveBeenCalledOnce();
  });

  it('error al clasificar la reserva: 503 sin concesión', async () => {
    const { handler, fulfill } = setup({ known: false, failReservation: true });
    expect((await handler(request())).status).toBe(503);
    expect(fulfill).not.toHaveBeenCalled();
  });

  it('hechos del evento distintos de la BD: ACK sin llamar a fulfillment', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const db of [{ dbAmount: 12344 }, { dbCurrency: 'USD' }]) {
        const { handler, fulfill, record } = setup(db);
        expect((await handler(request())).status).toBe(200);
        expect(record).toHaveBeenCalledOnce();
        expect(fulfill).not.toHaveBeenCalled();
      }
      expect(spy.mock.calls.map(c => JSON.stringify(c)).join('')).toContain('facts_mismatch');
    } finally { spy.mockRestore(); }
  });

  it('resultados definitivos de la RPC, incluidos los sin concesión, se ack con log sin PII', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const result of ['fulfilled', 'already_paid', 'already_entitled', 'already_processed', 'requires_manual_review', 'missing_order', 'receipt_bound_to_other_user'] as Fulfillment[]) {
        const { handler, fulfill } = setup({ result });
        expect((await handler(request())).status).toBe(200);
        expect(fulfill).toHaveBeenCalledOnce();
      }
      const logged = spy.mock.calls.map(c => JSON.stringify(c)).join('');
      expect(logged).toContain('requires_manual_review');
      expect(logged).not.toContain(USER);
      expect(logged).not.toContain(ORDER);
      expect(logged).not.toContain('12345');
      expect(logged).not.toContain('eur');
    } finally { spy.mockRestore(); }
  });

  it('fallo de fulfill o resultado desconocido: 503 sin detalle privado', async () => {
    for (const o of [{ failFulfill: true }, { result: 'bogus' as Fulfillment }]) {
      const { handler, fulfill } = setup(o);
      const res = await handler(request());
      expect(res.status).toBe(503);
      expect(await res.text()).toBe('');
      expect(fulfill).toHaveBeenCalledOnce();
    }
  });

  it('adapter normaliza la moneda para la RPC y valida el resultado', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'fulfilled', error: null });
    const deps = createDependencies(stripe, cryptoProvider, { rpc });
    const facts = { eventId: 'evt_123', orderId: ORDER, sessionId: 'cs_test_123', userId: USER, amountMinor: 12345, currency: 'eur', taxMinor: 1234 };
    expect(await deps.fulfill(facts)).toBe('fulfilled');
    expect(rpc).toHaveBeenCalledWith('fulfill_paid_event', {
      p_event_id: 'evt_123', p_order: ORDER, p_session: 'cs_test_123', p_actor: USER,
      p_amount_minor: 12345, p_currency: 'EUR', p_tax_minor: 1234,
    });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'order mismatch' } });
    await expect(deps.fulfill(facts)).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: 'unexpected', error: null });
    await expect(deps.fulfill(facts)).rejects.toThrow();
  });

  it('adapter acota importes e impuestos al rango integer de SQL', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'fulfilled', error: null });
    const deps = createDependencies(stripe, cryptoProvider, { rpc });
    const max = { ...baseFacts, amountMinor: SQL_INT_MAX, taxMinor: SQL_INT_MAX };
    expect(await deps.fulfill(max)).toBe('fulfilled');
    expect(rpc).toHaveBeenCalledWith('fulfill_paid_event', expect.objectContaining({
      p_amount_minor: SQL_INT_MAX, p_tax_minor: SQL_INT_MAX,
    }));
    await expect(deps.fulfill({ ...baseFacts, amountMinor: SQL_INT_MAX + 1, taxMinor: null })).rejects.toThrow();
    await expect(deps.fulfill({ ...baseFacts, taxMinor: SQL_INT_MAX + 1 })).rejects.toThrow();
    await expect(deps.reservation!(ORDER, 'cs_test_123', SQL_INT_MAX + 1, 'EUR')).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: 'pending', error: null });
    expect(await deps.reservation!(ORDER, 'cs_test_123', SQL_INT_MAX, 'EUR')).toBe('pending');
  });

  it('adapter rechaza importe fuera de integer en la lectura del pedido', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ user_id: USER, amount_minor: SQL_INT_MAX + 1, currency: 'EUR' }], error: null,
    });
    const deps = createDependencies(stripe, cryptoProvider, { rpc });
    await expect(deps.order(ORDER, 'cs_test_123')).rejects.toThrow();
    rpc.mockResolvedValueOnce({
      data: [{ user_id: USER, amount_minor: SQL_INT_MAX, currency: 'EUR' }], error: null,
    });
    expect(await deps.order(ORDER, 'cs_test_123')).toEqual({
      known: true, userId: USER, amountMinor: SQL_INT_MAX, currency: 'EUR',
    });
  });

  it('adapter consulta el estado de la reserva con campos exactos y los valida', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'pending', error: null });
    const deps = createDependencies(stripe, cryptoProvider, { rpc });
    expect(await deps.reservation!(ORDER, 'cs_test_123', 12345, 'eur')).toBe('pending');
    expect(rpc).toHaveBeenCalledWith('server_checkout_pending_state', {
      p_order: ORDER, p_session: 'cs_test_123', p_amount: 12345, p_currency: 'EUR',
    });
    rpc.mockResolvedValueOnce({ data: 'unresolvable', error: null });
    expect(await deps.reservation!(ORDER, 'cs_test_123', 12345, 'EUR')).toBe('unresolvable');
    rpc.mockResolvedValueOnce({ data: 'granted', error: null });
    await expect(deps.reservation!(ORDER, 'cs_test_123', 12345, 'EUR')).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'db' } });
    await expect(deps.reservation!(ORDER, 'cs_test_123', 12345, 'EUR')).rejects.toThrow();
    await expect(deps.reservation!(ORDER, 'cs_test_123', -1, 'EUR')).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it('adapter cablea todas las dependencias que usa el handler', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const deps = createDependencies(stripe, cryptoProvider, { rpc });
    expect(Object.keys(deps).sort()).toEqual(['fulfill', 'order', 'record', 'reservation', 'verify'].sort());
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { order } = deps;
    expect(await order(ORDER, 'cs_test_123')).toEqual({ known: false, userId: null, amountMinor: null, currency: null });
    expect(rpc).toHaveBeenCalledWith('server_checkout_order_for_event', {
      p_order: ORDER, p_session: 'cs_test_123',
    });
  });
});
