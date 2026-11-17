import { describe, it, expect, vi } from 'vitest';
import { makeHandler, type Dependencies } from './handler';

const user = '00000000-0000-0000-0000-000000000001';
const course = '10000000-0000-0000-0000-000000000001';
const attempt = '20000000-0000-0000-0000-000000000001';
const offer = { owned: false, slug: 'curso', price_id: '30000000-0000-0000-0000-000000000001', amount_minor: 100, currency: 'EUR', provider_price_id: 'price_fixture' };
function setup() {
  const io: Dependencies = {
    getUser: vi.fn().mockResolvedValue({ id: user, confirmed: true }),
    offer: vi.fn().mockResolvedValue(offer),
    price: vi.fn().mockResolvedValue({ active: true, currency: 'eur', unit_amount: 100, type: 'one_time', recurring: null }),
    create: vi.fn().mockResolvedValue('https://checkout.stripe.com/c/pay/test'),
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
    expect(calls[0][0].success).toBe('http://localhost:4200/mis-cursos?checkout=success');
    expect(calls[0][0].cancel).toBe('http://localhost:4200/cursos/curso');
    expect(calls[0][0].metadata).not.toHaveProperty('email');
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
});
