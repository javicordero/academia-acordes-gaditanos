import { describe, it, expect, vi } from 'vitest';
import { RESERVATION_TTL_SECONDS, makeHandler, type Dependencies } from './handler';
import { canonicalAttemptId } from './attempt';

const user = '00000000-0000-0000-0000-000000000001';
const course = '10000000-0000-0000-0000-000000000001';
const attempt = '20000000-0000-0000-0000-000000000001';
// El servidor IGNORA `attempt` y deriva éste de Auth + curso (mismo vector que
// el cliente: canonicalAttemptId(user, course)).
const canonical = canonicalAttemptId(user, course);
const order = '40000000-0000-0000-0000-000000000001';
const recoveryOrder = '40000000-0000-0000-0000-000000000002';
const session = 'cs_test_session123';
// Origen DEV compartido por móvil y escritorio: exige flag TEST explícito.
const tailscale = 'http://100.108.147.80:4200';
const offer = { owned: false, slug: 'curso', price_id: '30000000-0000-0000-0000-000000000001', amount_minor: 100, currency: 'EUR', provider_price_id: 'price_fixture' };
function setup() {
  const io: Dependencies = {
    getUser: vi.fn().mockResolvedValue({ id: user, confirmed: true }),
    offer: vi.fn().mockResolvedValue(offer),
    price: vi.fn().mockResolvedValue({ active: true, currency: 'eur', unit_amount: 100, type: 'one_time', recurring: null }),
    // Mock explícito: la reserva real la hace la RPC reserve_checkout_order.
    reserve: vi.fn().mockResolvedValue({ order_id: order }),
    create: vi.fn().mockResolvedValue({ id: session, url: 'https://checkout.stripe.com/c/pay/test' }),
    bind: vi.fn().mockResolvedValue('bound'),
    // Stripe es la única fuente del estado. Por defecto la sesión sigue abierta.
    sessionStatus: vi.fn().mockResolvedValue({
      status: 'open', paymentStatus: 'unpaid',
      metadata: { user_id: user, course_id: course, attempt_id: attempt, order_id: order },
    }),
  };
  const config = { origins: ['http://localhost:4200'], appOrigin: 'http://localhost:4200', enabled: true, termsVersion: 'test', allowHttpTestOrigin: false };
  const call = (
    body: unknown = { courseId: course, attemptId: attempt },
    token = 'Bearer valid',
    origin = 'http://localhost:4200',
    url = 'http://local',
  ) => makeHandler(io, config)(new Request(url, {
    method: 'POST', headers: { authorization: token, origin }, body: JSON.stringify(body),
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
    expect(s.io.reserve).not.toHaveBeenCalled();
    expect(s.io.price).not.toHaveBeenCalled();
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
    expect(await (await s.call()).json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay/test', sessionId: session, attemptId: canonical,
    });
    await s.call();
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls[0][1]).toBe(calls[1][1]);
    const success = new URL(calls[0][0].success);
    expect(success.origin + success.pathname).toBe('http://localhost:4200/mis-cursos');
    expect(success.searchParams.get('checkout')).toBe('success');
    expect(success.searchParams.get('order_id')).toBe(order);
    expect(calls[0][0].cancel).toBe('http://localhost:4200/cursos/curso?checkout=cancelled');
    expect(new URL(calls[0][0].cancel).searchParams.get('checkout')).toBe('cancelled');
    expect(new URL(calls[0][0].cancel).searchParams.has('order_id')).toBe(false);
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
  it('clave de idempotencia: ligada al pedido, estable ante intentos aleatorios del cuerpo', async () => {
    const s = setup();
    const user2 = '00000000-0000-0000-0000-000000000002';
    const course2 = '10000000-0000-0000-0000-000000000002';
    const order2 = '40000000-0000-0000-0000-000000000002';
    const order3 = '40000000-0000-0000-0000-000000000003';
    const attempt2 = '20000000-0000-0000-0000-000000000002';
    vi.mocked(s.io.getUser).mockImplementation(async token => ({
      id: token === 'u2' ? user2 : user, confirmed: true,
    }));
    vi.mocked(s.io.reserve).mockImplementation(async (u, c) => ({
      order_id: u === user2 ? order2 : (c === course2 ? order3 : order),
    }));
    const keyOf = async (courseId: string, bodyAttempt = attempt, token = 'Bearer valid') => {
      const res = await s.call({ courseId, attemptId: bodyAttempt }, token);
      expect(res.status).toBe(200);
      const calls = vi.mocked(s.io.create).mock.calls;
      return calls[calls.length - 1][1];
    };
    const base = await keyOf(course);
    expect(await keyOf(course)).toBe(base);
    // El cuerpo NO es autoridad: otro attempt con el mismo pedido da la misma clave.
    expect(await keyOf(course, attempt2)).toBe(base);
    expect(await keyOf(course2)).not.toBe(base);
    expect(await keyOf(course, attempt, 'Bearer u2')).not.toBe(base);
    const reserves = vi.mocked(s.io.reserve).mock.calls;
    expect(reserves.every(call => call[2] === canonicalAttemptId(call[0], call[1]))).toBe(true);
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls[0][0].metadata.user_id).toBe(user);
    expect(calls[3][0].metadata.course_id).toBe(course2);
    expect(calls[4][0].metadata.user_id).toBe(user2);
  });
  it('reserva el pedido antes de Stripe y envía order_id en metadata', async () => {
    const s = setup();
    expect((await s.call()).status).toBe(200);
    expect(s.io.reserve).toHaveBeenCalledWith(user, course, canonical, RESERVATION_TTL_SECONDS);
    const [reserveAt] = vi.mocked(s.io.reserve).mock.invocationCallOrder;
    const [priceAt] = vi.mocked(s.io.price).mock.invocationCallOrder;
    const [createAt] = vi.mocked(s.io.create).mock.invocationCallOrder;
    expect(reserveAt).toBeLessThan(priceAt);
    expect(priceAt).toBeLessThan(createAt);
    const metadata = vi.mocked(s.io.create).mock.calls[0][0].metadata;
    expect(metadata).toEqual({
      user_id: user, course_id: course, price_id: offer.price_id,
      attempt_id: canonical, terms_version: 'test', order_id: order,
    });
  });
  it('sin reserva configurada o sin pedido devuelve 409 y nunca llama a Stripe', async () => {
    const missing = setup();
    delete missing.io.reserve;
    expect((await missing.call()).status).toBe(409);
    expect(missing.io.price).not.toHaveBeenCalled();
    expect(missing.io.create).not.toHaveBeenCalled();
    const failed = setup();
    vi.mocked(failed.io.reserve).mockResolvedValueOnce(null).mockResolvedValueOnce({ order_id: 'no-uuid' });
    expect((await failed.call()).status).toBe(409);
    expect((await failed.call()).status).toBe(409);
    expect(failed.io.price).not.toHaveBeenCalled();
    expect(failed.io.create).not.toHaveBeenCalled();
  });
  it('la reserva va antes de Stripe: oferta inválida no reserva; precio inválido no crea sesión', async () => {
    const s = setup();
    vi.mocked(s.io.offer).mockResolvedValueOnce(null);
    expect((await s.call()).status).toBe(409);
    expect(s.io.reserve).not.toHaveBeenCalled();
    vi.mocked(s.io.price).mockResolvedValueOnce({ active: false, currency: 'eur', unit_amount: 100, type: 'one_time', recurring: null });
    expect((await s.call()).status).toBe(409);
    expect(s.io.reserve).toHaveBeenCalledOnce();
    expect(s.io.create).not.toHaveBeenCalled();
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
    await expect(ok.json()).resolves.toEqual({
      url: 'https://checkout.stripe.com/c/pay/test', sessionId: session, attemptId: canonical,
    });
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
    expect(calls[0][0].cancel).toBe('http://localhost:4200/cursos/curso?checkout=cancelled');
    expect(calls[0][0].metadata.attempt_id).toBe(canonical);
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

  it('HTTP de Tailscale cerrado por defecto; localhost y https siguen estables', async () => {
    const denied = setup();
    const valid = { courseId: course, attemptId: attempt };
    expect((await denied.call(valid, 'Bearer valid', tailscale)).status).toBe(403);
    denied.config.origins = [tailscale];
    denied.config.appOrigin = tailscale;
    expect((await denied.call(valid, 'Bearer valid', tailscale)).status).toBe(500);
    expect(denied.io.create).not.toHaveBeenCalled();

    const local = setup();
    expect((await local.call(valid)).status).toBe(200);
    const https = setup();
    https.config.origins = ['https://academia.example'];
    https.config.appOrigin = 'https://academia.example';
    expect((await https.call(valid, 'Bearer valid', 'https://academia.example')).status).toBe(200);
    expect(vi.mocked(https.io.create).mock.calls[0][0].success)
      .toBe(`https://academia.example/mis-cursos?checkout=success&order_id=${order}`);
  });

  it('HTTP de Tailscale sólo con flag TEST + allowlist exacto; retorno canónico intacto', async () => {
    const s = setup();
    s.config.origins = [tailscale];
    s.config.appOrigin = tailscale;
    s.config.allowHttpTestOrigin = true;
    expect((await s.call({ courseId: course, attemptId: attempt }, 'Bearer valid', tailscale)).status).toBe(200);
    const input = vi.mocked(s.io.create).mock.calls[0][0];
    expect(input.success).toBe(`${tailscale}/mis-cursos?checkout=success&order_id=${order}`);
    expect(new URL(input.success).searchParams.get('order_id')).toBe(order);
    expect(input.cancel).toBe(`${tailscale}/cursos/curso?checkout=cancelled`);
    expect(input.metadata.terms_version).toBe('test');
    expect(input.metadata).not.toHaveProperty('accepted_terms');
    expect(input.metadata).not.toHaveProperty('consent');
  });

  it('el flag no abre APP_ORIGIN ausente del allowlist ni un Origin ajeno', async () => {
    const noAllow = setup();
    noAllow.config.appOrigin = tailscale;
    noAllow.config.allowHttpTestOrigin = true;
    // Origin de petición permitido para aislar el APP_ORIGIN fuera del allowlist.
    expect((await noAllow.call({ courseId: course, attemptId: attempt })).status).toBe(500);
    expect(noAllow.io.create).not.toHaveBeenCalled();
    const foreign = setup();
    foreign.config.origins = [tailscale];
    foreign.config.appOrigin = tailscale;
    foreign.config.allowHttpTestOrigin = true;
    expect((await foreign.call({ courseId: course, attemptId: attempt }, 'Bearer valid', 'https://evil.example')).status).toBe(403);
    expect(foreign.io.create).not.toHaveBeenCalled();
  });

  it('URL de app con credenciales, fragmento, ruta o query no se acepta con el flag activo', async () => {
    for (const appOrigin of [
      'http://user:pass@100.108.147.80:4200',
      `${tailscale}/#frag`,
      `${tailscale}/cursos`,
      `${tailscale}/?x=1`,
    ]) {
      const s = setup();
      s.config.origins = [tailscale, appOrigin];
      s.config.appOrigin = appOrigin;
      s.config.allowHttpTestOrigin = true;
      expect((await s.call({ courseId: course, attemptId: attempt }, 'Bearer valid', tailscale)).status).toBe(500);
      expect(s.io.create).not.toHaveBeenCalled();
    }
  });

  it('cuerpo, query y cabeceras del cliente no activan el flag ni cambian el retorno', async () => {
    const injected = setup();
    const bad = await makeHandler(injected.io, injected.config)(new Request('http://local?CHECKOUT_ALLOW_HTTP_TEST_ORIGIN=true', {
      method: 'POST',
      headers: { authorization: 'Bearer valid', origin: 'http://localhost:4200', 'x-checkout-allow-http-test-origin': 'true' },
      body: JSON.stringify({ courseId: course, attemptId: attempt, appOrigin: tailscale, allowHttpTestOrigin: true, success_url: 'https://evil.example' }),
    }));
    expect(bad.status).toBe(400);
    expect(injected.io.create).not.toHaveBeenCalled();

    const s = setup();
    const res = await makeHandler(s.io, s.config)(new Request(
      `http://local?origin=${encodeURIComponent(tailscale)}&success_url=${encodeURIComponent('https://evil.example')}`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer valid', origin: 'http://localhost:4200' },
        body: JSON.stringify({ courseId: course, attemptId: attempt }),
      },
    ));
    expect(res.status).toBe(200);
    const input = vi.mocked(s.io.create).mock.calls[0][0];
    expect(input.success).toContain('http://localhost:4200/mis-cursos');
    expect(input.success).not.toContain(tailscale);
    expect(input.success).not.toContain('evil.example');
    expect(s.config.allowHttpTestOrigin).toBe(false);
  });

  it('marcador QA: coherencia env/BD antes de Stripe, sin consentimientos inventados', async () => {
    const marker = 'sandbox-no-contract-v1';
    const ok = setup();
    ok.config.termsVersion = marker;
    vi.mocked(ok.io.reserve).mockResolvedValue({ order_id: order, terms_version: marker });
    expect((await ok.call()).status).toBe(200);
    const metadata = vi.mocked(ok.io.create).mock.calls[0][0].metadata;
    expect(metadata.terms_version).toBe(marker);
    expect(metadata).not.toHaveProperty('consent');
    expect(metadata).not.toHaveProperty('accepted_terms');

    const clash = setup();
    clash.config.termsVersion = marker;
    vi.mocked(clash.io.reserve).mockResolvedValue({ order_id: order, terms_version: 'config-distinta' });
    expect((await clash.call()).status).toBe(409);
    expect(clash.io.price).not.toHaveBeenCalled();
    expect(clash.io.create).not.toHaveBeenCalled();

    // Si el DTO no trae versión no se finge comparación: queda documentado
    // como límite de coherencia que el operador debe resolver en configuración.
    const absent = setup();
    absent.config.termsVersion = marker;
    vi.mocked(absent.io.reserve).mockResolvedValue({ order_id: order });
    expect((await absent.call()).status).toBe(200);
    expect(absent.io.price).toHaveBeenCalledOnce();
  });

  it('reintento tras cancelar: sesión open, misma reserva, misma clave y misma sesión', async () => {
    const s = setup();
    const body = { courseId: course, attemptId: attempt, sessionId: session };
    expect((await s.call(body)).status).toBe(200);
    expect((await s.call(body)).status).toBe(200);
    expect(s.io.sessionStatus).toHaveBeenCalledTimes(2);
    expect(s.io.sessionStatus).toHaveBeenCalledWith(session);
    expect(s.io.reserve).toHaveBeenCalledTimes(2);
    expect(s.io.reserve).toHaveBeenNthCalledWith(1, user, course, canonical, RESERVATION_TTL_SECONDS);
    expect(s.io.reserve).toHaveBeenNthCalledWith(2, user, course, canonical, RESERVATION_TTL_SECONDS);
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls[0][1]).toBe(calls[1][1]);
    expect(calls[0][0].metadata.order_id).toBe(order);
    expect(calls[1][0].metadata.order_id).toBe(order);
  });

  it('expired confirmado por Stripe: verificación, sucesor de BD y sesión nueva; canónico intacto', async () => {
    const s = setup();
    const freshSession = 'cs_test_recovery456';
    const body = { courseId: course, attemptId: attempt, sessionId: session };
    // Primero la sesión abierta: misma reserva y clave del pedido inicial.
    expect((await s.call(body)).status).toBe(200);
    const keyA = vi.mocked(s.io.create).mock.calls[0][1];

    vi.mocked(s.io.sessionStatus).mockResolvedValue({
      status: 'expired', paymentStatus: 'unpaid',
      metadata: { user_id: user, course_id: course, attempt_id: attempt, order_id: order },
    });
    // La BD cierra el intento y devuelve SU sucesor (otro order_id). El handler
    // no deriva nada del marker: sigue enviando el canónico a la reserva.
    vi.mocked(s.io.reserve).mockResolvedValue({ order_id: recoveryOrder });
    vi.mocked(s.io.create).mockResolvedValue({
      id: freshSession, url: 'https://checkout.stripe.com/c/pay/recovery',
    });
    const first = await s.call(body);
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { url: string; sessionId: string; attemptId: string };
    expect(firstBody.url).toBe('https://checkout.stripe.com/c/pay/recovery');
    expect(firstBody.sessionId).toBe(freshSession);
    expect(firstBody.attemptId).toBe(canonical);
    expect((await s.call(body)).status).toBe(200);

    const reserves = vi.mocked(s.io.reserve).mock.calls;
    expect(reserves).toHaveLength(3);
    expect(reserves.every(call => call[2] === canonical)).toBe(true);
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls[0][1]).toBe(keyA);
    expect(calls[1][1]).not.toBe(keyA); // el pedido cambió: sesión nueva
    expect(calls[1][1]).toBe(calls[2][1]); // estable ante doble tab/reintento
    expect(calls[1][0].metadata.attempt_id).toBe(canonical);
    expect(calls[1][0].metadata.order_id).toBe(recoveryOrder);
    expect(new URL(calls[1][0].success).searchParams.get('order_id')).toBe(recoveryOrder);
    expect(calls[1][0].cancel).toBe('http://localhost:4200/cursos/curso?checkout=cancelled');
    expect(calls[1][0].price).toBe(offer.provider_price_id);
    expect(s.io.bind).toHaveBeenCalledWith(user, recoveryOrder, freshSession);
  });

  it('otra expiración encadena el sucesor siguiente sin cambiar el intento canónico', async () => {
    const s = setup();
    const sessionB = 'cs_test_second';
    const nextOrder = '40000000-0000-0000-0000-000000000003';
    vi.mocked(s.io.sessionStatus).mockResolvedValue({
      status: 'expired', paymentStatus: 'unpaid',
      metadata: { user_id: user, course_id: course, attempt_id: canonical, order_id: recoveryOrder },
    });
    vi.mocked(s.io.reserve).mockResolvedValue({ order_id: nextOrder });
    vi.mocked(s.io.create).mockResolvedValue({
      id: 'cs_test_third', url: 'https://checkout.stripe.com/c/pay/third',
    });

    const res = await s.call({ courseId: course, attemptId: canonical, sessionId: sessionB });
    expect(res.status).toBe(200);
    expect((await res.json() as { attemptId: string }).attemptId).toBe(canonical);
    expect(s.io.reserve).toHaveBeenCalledWith(user, course, canonical, RESERVATION_TTL_SECONDS);
    expect(vi.mocked(s.io.create).mock.calls[0][0].metadata.attempt_id).toBe(canonical);
    expect(vi.mocked(s.io.create).mock.calls[0][0].metadata.order_id).toBe(nextOrder);
  });

  it('estado no verificable, red caída o sesión completada: nunca abre otro intento', async () => {
    const cases: Array<{ label: string; status: unknown; code: number }> = [
      { label: 'red', status: null, code: 422 },
      { label: 'desconocido', status: {
        status: 'otro', metadata: { user_id: user, course_id: course, attempt_id: attempt },
      }, code: 422 },
      { label: 'sin metadata', status: { status: 'expired' }, code: 409 },
      { label: 'pagada', status: { status: 'complete', paymentStatus: 'paid', metadata: {} }, code: 409 },
      { label: 'procesando', status: { status: 'complete', paymentStatus: 'unpaid', metadata: {} }, code: 409 },
    ];
    for (const item of cases) {
      const s = setup();
      vi.mocked(s.io.sessionStatus).mockImplementation(async () => {
        if (item.status === null) throw new Error('red caída');
        return item.status as any;
      });
      const res = await s.call({ courseId: course, attemptId: attempt, sessionId: session });
      expect(res.status, item.label).toBe(item.code);
      const text = await res.text();
      expect(text).not.toContain('checkout.stripe.com');
      expect(s.io.reserve).not.toHaveBeenCalled();
      expect(s.io.price).not.toHaveBeenCalled();
      expect(s.io.create).not.toHaveBeenCalled();
      expect(s.io.bind).not.toHaveBeenCalled();
    }
  });

  it('una sesión ajena, de otro curso o de otro intento no autoriza recuperación', async () => {
    const bad = [
      { user_id: '00000000-0000-0000-0000-000000000099', course_id: course, attempt_id: attempt },
      { user_id: user, course_id: '10000000-0000-0000-0000-000000000099', attempt_id: attempt },
      { user_id: user, course_id: course, attempt_id: '20000000-0000-0000-0000-000000000099' },
    ];
    for (const metadata of bad) {
      const s = setup();
      vi.mocked(s.io.sessionStatus).mockResolvedValue({ status: 'expired', metadata });
      expect((await s.call({ courseId: course, attemptId: attempt, sessionId: session })).status).toBe(409);
      expect(s.io.reserve).not.toHaveBeenCalled();
      expect(s.io.create).not.toHaveBeenCalled();
    }
  });

  it('url ausente con sesión open no se interpreta como expirada ni crea otro intento', async () => {
    const s = setup();
    vi.mocked(s.io.create).mockResolvedValue({ id: session, url: null });
    const res = await s.call({ courseId: course, attemptId: attempt, sessionId: session });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('checkout.stripe.com');
    expect(s.io.reserve).toHaveBeenCalledOnce();
    expect(s.io.reserve).toHaveBeenCalledWith(user, course, canonical, RESERVATION_TTL_SECONDS);
  });

  it('curso ya adquirido: ni siquiera se consulta el estado para recuperar', async () => {
    const s = setup();
    vi.mocked(s.io.offer).mockResolvedValue({ ...offer, owned: true });
    const res = await s.call({ courseId: course, attemptId: attempt, sessionId: session });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('Curso ya adquirido');
    expect(s.io.sessionStatus).not.toHaveBeenCalled();
    expect(s.io.reserve).not.toHaveBeenCalled();
    expect(s.io.create).not.toHaveBeenCalled();
  });

  it('sin dependency de estado de Stripe no se abre ninguna recuperación', async () => {
    const s = setup();
    delete s.io.sessionStatus;
    const res = await s.call({ courseId: course, attemptId: attempt, sessionId: session });
    expect(res.status).toBe(409);
    expect(s.io.reserve).not.toHaveBeenCalled();
    expect(s.io.create).not.toHaveBeenCalled();
  });

  it('el attemptId del cuerpo jamás manda: canónico en reserva, metadata y retorno', async () => {
    const s = setup();
    const forged = '20000000-0000-0000-0000-000000000099';
    const res = await s.call({ courseId: course, attemptId: forged });
    expect(res.status).toBe(200);
    expect(s.io.reserve).toHaveBeenCalledWith(user, course, canonical, RESERVATION_TTL_SECONDS);
    expect(vi.mocked(s.io.create).mock.calls[0][0].metadata.attempt_id).toBe(canonical);
    expect((await res.json() as { attemptId: string }).attemptId).toBe(canonical);
    // Con marcador, el intento del cuerpo sí se coteja con la metadata de Stripe
    // como PISTA: uno ajeno se rechaza sin reservar ni crear sesión.
    expect((await s.call({ courseId: course, attemptId: forged, sessionId: session })).status).toBe(409);
    expect(s.io.reserve).toHaveBeenCalledOnce();
    expect(s.io.create).toHaveBeenCalledOnce();
  });

  it('intento cerrado SIN marca: el sucesor de la BD reanuda sin duplicar sesión ni derecho', async () => {
    const s = setup();
    vi.mocked(s.io.reserve)
      .mockResolvedValueOnce({ order_id: order })
      .mockResolvedValue({ order_id: recoveryOrder });
    vi.mocked(s.io.create)
      .mockResolvedValueOnce({ id: session, url: 'https://checkout.stripe.com/c/pay/test' })
      .mockResolvedValue({ id: 'cs_test_reopened', url: 'https://checkout.stripe.com/c/pay/reopened' });
    const first = await s.call();
    expect((await first.json() as { attemptId: string }).attemptId).toBe(canonical);
    const second = await s.call();
    expect(second.status).toBe(200);
    const resumed = await second.json() as { url: string; sessionId: string; attemptId: string };
    expect(resumed.url).toBe('https://checkout.stripe.com/c/pay/reopened');
    expect(resumed.attemptId).toBe(canonical);
    expect(s.io.sessionStatus).not.toHaveBeenCalled();
    expect(s.io.reserve).toHaveBeenCalledTimes(2);
    expect(s.io.reserve).toHaveBeenCalledWith(user, course, canonical, RESERVATION_TTL_SECONDS);
    const calls = vi.mocked(s.io.create).mock.calls;
    expect(calls[0][1]).not.toBe(calls[1][1]);
    expect(calls[1][0].metadata.order_id).toBe(recoveryOrder);
    expect(s.io.bind).toHaveBeenCalledWith(user, recoveryOrder, 'cs_test_reopened');
    // Tercer reintento con el mismo estado: MISMA clave, sin pedido nuevo.
    expect((await s.call()).status).toBe(200);
    expect(vi.mocked(s.io.create).mock.calls[2][1]).toBe(calls[1][1]);
    expect(new Set(vi.mocked(s.io.create).mock.calls.map(([, key]) => key)).size).toBe(2);
  });
});
