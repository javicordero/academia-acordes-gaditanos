import { describe, it, expect, vi } from 'vitest';
import { RESERVATION_TTL_SECONDS, makeHandler, type Dependencies } from './handler';

const user = '00000000-0000-0000-0000-000000000001';
const course = '10000000-0000-0000-0000-000000000001';
const attempt = '20000000-0000-0000-0000-000000000001';
const order = '40000000-0000-0000-0000-000000000001';
const offer = { owned: false, slug: 'curso', price_id: '30000000-0000-0000-0000-000000000001', amount_minor: 100, currency: 'EUR', provider_price_id: 'price_fixture' };
function setup() {
  const io: Dependencies = {
    getUser: vi.fn().mockResolvedValue({ id: user, confirmed: true }),
    offer: vi.fn().mockResolvedValue(offer),
    price: vi.fn().mockResolvedValue({ active: true, currency: 'eur', unit_amount: 100, type: 'one_time', recurring: null }),
    // Mock explícito: la reserva real la hace la RPC reserve_checkout_order.
    reserve: vi.fn().mockResolvedValue({ order_id: order }),
    create: vi.fn().mockResolvedValue({ id: 'cs_test_session123', url: 'https://checkout.stripe.com/c/pay/test' }),
    bind: vi.fn().mockResolvedValue('bound'),
  };
  const config = { origins: ['http://localhost:4200'], appOrigin: 'http://localhost:4200', enabled: true, termsVersion: 'test' };
  const call = (body: unknown = { courseId: course, attemptId: attempt }, token = 'Bearer valid') => makeHandler(io, config)(new Request('http://local', {
    method: 'POST', headers: { authorization: token, origin: 'http://localhost:4200' }, body: JSON.stringify(body),
  }));
  return { io, config, call };
}
describe('create-checkout', () => {
  it('valida JWT y confirmación', async () => {
    const s = setup();
    expect((await s.call(undefined, '')).status).toBe(401);
    vi.mocked(s.io.getUser).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: user, confirmed: false });
    expect((await s.call()).status).toBe(401);
    expect((await s.call()).status).toBe(403);
  });
  it('rechaza campos y configuración no autorizados', async () => {
    const s = setup();
    expect((await s.call({ courseId: course, attemptId: attempt, price: 1 })).status).toBe(400);
    s.config.termsVersion = '';
    expect((await s.call()).status).toBe(409);
    expect(s.io.create).not.toHaveBeenCalled();
  });
  it('rechaza oferta ausente y propiedad activa', async () => {
    const s = setup();
    vi.mocked(s.io.offer).mockResolvedValueOnce(null).mockResolvedValueOnce({ ...offer, owned: true });
    expect((await s.call()).status).toBe(409);
    expect((await s.call()).status).toBe(409);
    expect(s.io.create).not.toHaveBeenCalled();
  });
  it('rechaza precios remotos inconsistentes y fallos', async () => {
    const s = setup();
    vi.mocked(s.io.price).mockResolvedValueOnce({ active: false, currency: 'eur', unit_amount: 100, type: 'one_time', recurring: null })
      .mockResolvedValueOnce({ active: true, currency: 'eur', unit_amount: 200, type: 'one_time', recurring: null })
      .mockRejectedValueOnce(new Error('privado'));
    expect((await s.call()).status).toBe(409);
    expect((await s.call()).status).toBe(409);
    const res = await s.call();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('privado');
  });
  it('idempotencia y retorno fijado en servidor', async () => {
    const s = setup();
    expect(await (await s.call()).json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/test' });
    await s.call();
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls[0][1]).toBe(calls[1][1]);
    const success = new URL(calls[0][0].success);
    expect(success.origin + success.pathname).toBe('http://localhost:4200/mis-cursos');
    expect(success.searchParams.get('checkout')).toBe('success');
    expect(success.searchParams.get('order_id')).toBe(order);
    expect(calls[0][0].cancel).toBe('http://localhost:4200/cursos/curso');
    expect(calls[0][0].metadata).not.toHaveProperty('email');
  });
  it('el order_id del retorno sale solo de la reserva, nunca del cliente ni de Stripe', async () => {
    const s = setup();
    const canonical = '50000000-0000-0000-0000-000000000005';
    vi.mocked(s.io.reserve).mockResolvedValue({ order_id: canonical });
    // Un cliente que intenta colar su propio pedido ni siquiera pasa el filtro de cuerpo.
    expect((await s.call({ courseId: course, attemptId: attempt, order_id: canonical })).status).toBe(400);
    expect((await s.call()).status).toBe(200);
    const input = vi.mocked(s.io.create).mock.calls[0][0];
    const success = new URL(input.success);
    expect(success.searchParams.get('order_id')).toBe(canonical);
    expect(success.searchParams.get('order_id')).not.toBe(order);
    // Ni identidad, ni importes, ni sesión, ni claves en la URL de retorno.
    expect([...success.searchParams.keys()].sort()).toEqual(['checkout', 'order_id']);
    expect(input.success).not.toContain(user);
    expect(input.success).not.toContain('cs_test_session123');
    expect(input.success).not.toContain('100');
  });
  it('un reintento already_bound conserva el pedido canónico en el retorno', async () => {
    const s = setup();
    vi.mocked(s.io.bind).mockResolvedValue('already_bound');
    expect((await s.call()).status).toBe(200);
    expect((await s.call()).status).toBe(200);
    const urls = vi.mocked(s.io.create).mock.calls.map(([input]) => input.success);
    expect(urls[0]).toBe(urls[1]);
    expect(new URL(urls[1]).searchParams.get('order_id')).toBe(order);
  });
  it('bloquea el origen ajeno y el servidor deshabilitado', async () => {
    const s = setup();
    s.config.enabled = false;
    expect((await s.call()).status).toBe(409);
    const res = await makeHandler(s.io, s.config)(new Request('http://local', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
  });
  it('rechaza métodos distintos de POST/OPTIONS con 405', async () => {
    const s = setup();
    const res = await makeHandler(s.io, s.config)(new Request('http://local', {
      method: 'GET', headers: { origin: 'http://localhost:4200', authorization: 'Bearer valid' },
    }));
    expect(res.status).toBe(405);
    expect(s.io.create).not.toHaveBeenCalled();
  });
  it('rechaza cuerpo mayor a 2048 bytes aunque sea JSON válido', async () => {
    const s = setup();
    const base = JSON.stringify({ courseId: course, attemptId: attempt });
    const raw = (body: string) => makeHandler(s.io, s.config)(new Request('http://local', {
      method: 'POST',
      headers: { authorization: 'Bearer valid', origin: 'http://localhost:4200', 'content-type': 'application/json' },
      body,
    }));
    expect((await raw(base + ' '.repeat(10))).status).toBe(200);
    expect((await raw(base + ' '.repeat(3000))).status).toBe(400);
    expect(s.io.create).toHaveBeenCalledTimes(1);
  });
  it('clave de idempotencia: distinta por usuario y curso, estable para el mismo ámbito', async () => {
    const s = setup();
    const user2 = '00000000-0000-0000-0000-000000000002';
    const course2 = '10000000-0000-0000-0000-000000000002';
    const attempt2 = '20000000-0000-0000-0000-000000000002';
    vi.mocked(s.io.getUser).mockImplementation(async token => ({
      id: token === 'u2' ? user2 : user, confirmed: true,
    }));
    const keyOf = async (courseId: string, attemptId: string, token = 'Bearer valid') => {
      const res = await s.call({ courseId, attemptId }, token);
      expect(res.status).toBe(200);
      const calls = vi.mocked(s.io.create).mock.calls;
      return calls[calls.length - 1][1];
    };
    const base = await keyOf(course, attempt);
    expect(await keyOf(course, attempt)).toBe(base);
    expect(await keyOf(course, attempt2)).not.toBe(base);
    expect(await keyOf(course2, attempt)).not.toBe(base);
    expect(await keyOf(course, attempt, 'Bearer u2')).not.toBe(base);
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls[0][0].metadata.user_id).toBe(user);
    expect(calls[3][0].metadata.course_id).toBe(course2);
    expect(calls[4][0].metadata.user_id).toBe(user2);
  });
  it('reserva el pedido antes de crear la sesión y envía order_id en metadata', async () => {
    const s = setup();
    expect((await s.call()).status).toBe(200);
    expect(s.io.reserve).toHaveBeenCalledWith(user, course, attempt, RESERVATION_TTL_SECONDS);
    const metadata = vi.mocked(s.io.create).mock.calls[0][0].metadata;
    expect(metadata).toEqual({
      user_id: user, course_id: course, price_id: offer.price_id,
      attempt_id: attempt, terms_version: 'test', order_id: order,
    });
  });
  it('sin reserva configurada o sin pedido devuelve 409 y nunca llama a Stripe', async () => {
    const missing = setup();
    delete missing.io.reserve;
    expect((await missing.call()).status).toBe(409);
    expect(missing.io.create).not.toHaveBeenCalled();
    const failed = setup();
    vi.mocked(failed.io.reserve).mockResolvedValueOnce(null).mockResolvedValueOnce({ order_id: 'no-uuid' });
    expect((await failed.call()).status).toBe(409);
    expect((await failed.call()).status).toBe(409);
    expect(failed.io.create).not.toHaveBeenCalled();
  });
  it('no reserva pedido cuando la oferta o el precio no son válidos', async () => {
    const s = setup();
    vi.mocked(s.io.offer).mockResolvedValueOnce(null);
    vi.mocked(s.io.price).mockResolvedValueOnce({ active: false, currency: 'eur', unit_amount: 100, type: 'one_time', recurring: null });
    expect((await s.call()).status).toBe(409);
    expect((await s.call()).status).toBe(409);
    expect(s.io.reserve).not.toHaveBeenCalled();
  });
  it('vincula con usuario de Auth, pedido reservado e id de sesión real', async () => {
    const s = setup();
    const res = await s.call();
    expect(res.status).toBe(200);
    expect(s.io.bind).toHaveBeenCalledOnce();
    expect(s.io.bind).toHaveBeenCalledWith(user, order, 'cs_test_session123');
    // La identidad del bind es la del token, no un campo del cuerpo.
    expect((s.io.bind as any).mock.calls[0][0]).not.toBe(attempt);
  });
  it('nunca devuelve URL antes de que el bind resuelva', async () => {
    const s = setup();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const calls: string[] = [];
    vi.mocked(s.io.bind).mockImplementation(async () => { calls.push('bind'); await gate; return 'bound'; });
    vi.mocked(s.io.create).mockImplementation(async () => {
      calls.push('create');
      return { id: 'cs_test_session123', url: 'https://checkout.stripe.com/c/pay/test' };
    });
    const pending = s.call();
    for (let i = 0; i < 50 && calls.length === 0; i += 1) await new Promise(r => setTimeout(r, 1));
    expect(calls).toEqual(['create', 'bind']);
    release();
    expect((await pending).status).toBe(200);
  });
  it('bind fallido (invalid/error) no devuelve URL ni sesión', async () => {
    for (const bind of [vi.fn().mockRejectedValue(new Error('privado')), vi.fn().mockResolvedValue('invalid')]) {
      const s = setup();
      s.io.bind = bind as any;
      const res = await s.call();
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain('checkout.stripe.com');
      expect(text).not.toContain('cs_test_session123');
    }
  });
  it('already_bound de la MISMA sesión es válido; un conflicto con otra no devuelve URL', async () => {
    const s = setup();
    vi.mocked(s.io.bind).mockResolvedValueOnce('already_bound');
    const ok = await s.call();
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ url: 'https://checkout.stripe.com/c/pay/test' });
    vi.mocked(s.io.bind).mockResolvedValueOnce('binding_conflict');
    const res = await s.call();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('checkout.stripe.com');
  });
  it('el reintento usa la misma clave canónica y la misma snapshot', async () => {
    const s = setup();
    vi.mocked(s.io.bind).mockRejectedValue(new Error('caída'));
    expect((await s.call()).status).toBe(500);
    vi.mocked(s.io.bind).mockResolvedValue('bound');
    expect((await s.call()).status).toBe(200);
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][1]).toBe(calls[1][1]);
    expect(calls[0][1]).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[0][0]).toEqual(calls[1][0]);
    expect(calls[0][0].metadata.order_id).toBe(order);
    expect(calls[0][0].metadata.attempt_id).toBe(attempt);
  });
  it('sesión o URL no confiables del proveedor no se propagan', async () => {
    const badIds = ['pi_algo', 'ch_test_1', 'cs_test_ ok', 'cs_live_'];
    for (const id of badIds) {
      const s = setup();
      vi.mocked(s.io.create).mockResolvedValueOnce({ id, url: 'https://checkout.stripe.com/c/pay/test' });
      expect((await s.call()).status).toBe(500);
      expect(s.io.bind).not.toHaveBeenCalled();
    }
    // Sesión y URL se validan ANTES de escribir en BD: una URL ajena, HTTP o
    // nula provoca 500 sin bind y sin filtrar el destino.
    for (const url of ['https://evil.example/c/pay', 'http://checkout.stripe.com/c/pay', 'not-a-url', null]) {
      const s = setup();
      vi.mocked(s.io.create).mockResolvedValue({ id: 'cs_test_session123', url } as any);
      const res = await s.call();
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain('evil.example');
      expect(text).not.toContain('checkout.stripe.com');
      expect(s.io.bind).not.toHaveBeenCalled();
    }
    const missing = setup();
    delete missing.io.bind;
    expect((await missing.call()).status).toBe(409);
    expect(missing.io.create).not.toHaveBeenCalled();
  });
});
