// Mocks puros de E/S; el SDK de Stripe se usa de verdad sólo para firmar y
// verificar un fixture sintético. No es Supabase ni Stripe real: sin red,
// sin claves reales y sin datos personales.
import { describe, it, expect, vi } from 'vitest';
import Stripe from 'stripe';
import { makeHandler, type Fulfillment, type Recorded } from './handler';
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

type Options = { recorded?: Recorded; known?: boolean; result?: Fulfillment; failFulfill?: boolean };
function setup(o: Options = {}) {
  const record = vi.fn().mockResolvedValue(o.recorded ?? 'created');
  const order = vi.fn().mockResolvedValue({ known: o.known ?? true, userId: USER, amountMinor: 12345, currency: 'EUR' });
  const fulfill = vi.fn().mockResolvedValue(o.result ?? 'fulfilled');
  if (o.failFulfill) fulfill.mockRejectedValue(new Error('private diagnostic'));
  const deps = { verify: vi.fn(verify), record, order, fulfill };
  const handler = makeHandler(deps, { enabled: true, secret, expectedLiveMode: false });
  return { record, order, fulfill, deps, handler };
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

  it('importe, moneda o impuesto con forma inválida: 400 sin fulfill', async () => {
    for (const patch of [
      { amount_total: -1 }, { amount_total: 1.5 }, { currency: 'euros' },
      { total_details: { amount_tax: -1 } }, { total_details: { amount_tax: 12346 } },
    ]) {
      const { handler, fulfill, record } = setup();
      expect((await handler(request(withObject(patch)))).status).toBe(400);
      expect(record).not.toHaveBeenCalled();
      expect(fulfill).not.toHaveBeenCalled();
    }
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

  it('pedido no elegible: 200 ack sin fulfillment', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { handler, fulfill } = setup({ known: false });
      expect((await handler(request())).status).toBe(200);
      expect(fulfill).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(JSON.stringify({ webhook: 'stripe', status: 200, eventId: 'evt_123', reason: 'missing_order' }));
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
});
