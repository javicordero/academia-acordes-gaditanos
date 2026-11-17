import { describe, it, expect, vi } from 'vitest';
import Stripe from 'stripe';
import { makeHandler } from './handler';
import { createDependencies } from './adapter';

const stripe = new Stripe('sk_test_unused');
const secret = 'whsec_synthetic_fixture_only';
const base = { id: 'evt_123', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_123', metadata: { order_id: '12345678-1234-1234-1234-123456789abc' }, note: 'guitarra ñ' } } };
function setup(result = 'created') {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  const deps = createDependencies(stripe, Stripe.createSubtleCryptoProvider(), { rpc });
  return { rpc, deps, handler: makeHandler(deps, { enabled: true, secret, expectedLiveMode: false }) };
}
function request(event: unknown = base, timestamp = Math.floor(Date.now() / 1000), change?: (s: string) => string) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
  return new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: change ? change(payload) : payload });
}
describe('recepción Stripe', () => {
  it('verifica firma SDK real y conserva UTF-8 para hash y datos mínimos', async () => {
    const { handler, rpc } = setup();
    expect((await handler(request())).status).toBe(503);
    expect(rpc).toHaveBeenCalledOnce();
    const args = rpc.mock.calls[0][1];
    expect(args.p_order_id).toBe(base.data.object.metadata.order_id);
    expect(args.p_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain('guitarra');
  });
  it('rechaza alteración, ausencia y fechas fuera de tolerancia sin escribir', async () => {
    const { handler, rpc } = setup();
    expect((await handler(request(base, undefined, p => p.replace('guitarra', 'otra')))).status).toBe(400);
    expect((await handler(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status).toBe(400);
    expect((await handler(request(base, Math.floor(Date.now()/1000)-301))).status).toBe(400);
    expect((await handler(request(base, Math.floor(Date.now()/1000)+301))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('bloqueo y secreto ausente cierran antes de verificar o escribir', async () => {
    const { deps, rpc } = setup();
    expect((await makeHandler(deps, { enabled: false, secret, expectedLiveMode: false })(request())).status).toBe(503);
    expect((await makeHandler(deps, { enabled: true, expectedLiveMode: false })(request())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('ignora tipos no soportados y rechaza live', async () => {
    const { handler, rpc } = setup();
    expect((await handler(request({ ...base, type: 'charge.refunded' }))).status).toBe(200);
    expect((await handler(request({ ...base, livemode: true }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('no confirma pendientes ni errores; confirma solo procesados', async () => {
    for (const [state, status] of [['received_unprocessed', 503], ['processed', 200]] as const) {
      expect((await setup(state).handler(request())).status).toBe(status);
    }
    const { handler, rpc } = setup();
    rpc.mockRejectedValue(new Error('private diagnostic'));
    const result = await handler(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('private diagnostic');
  });
  it('limita método, tipo y tamaño', async () => {
    const { handler, rpc } = setup();
    expect((await handler(new Request('http://localhost'))).status).toBe(405);
    expect((await handler(new Request('http://localhost', { method: 'POST', body: 'x' }))).status).toBe(415);
    expect((await handler(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 'x' }, body: 'x'.repeat(262145) }))).status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
});
