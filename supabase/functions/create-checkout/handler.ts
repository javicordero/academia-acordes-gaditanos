const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Offer = { owned: boolean; slug: string; price_id: string; amount_minor: number; currency: string; provider_price_id: string };
export interface Dependencies {
  getUser(token: string): Promise<{ id: string; confirmed: boolean } | null>;
  offer(user: string, course: string): Promise<Offer | null>;
  price(id: string): Promise<{ active: boolean; currency: string; unit_amount: number | null; type: string; recurring: unknown }>;
  create(input: { price: string; success: string; cancel: string; metadata: Record<string, string> }, key: string): Promise<string | null>;
}

export function makeHandler(io: Dependencies, config: { origins: string[]; appOrigin: string; enabled: boolean; termsVersion?: string }) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && !config.origins.includes(origin)) return new Response(null, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const reply = (status: number, error: string) => Response.json({ error }, { status, headers });
    if (req.method !== 'POST') return reply(405, 'Método no permitido');
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization') ?? '');
    if (!token) return reply(401, 'Autenticación necesaria');
    try {
      const user = await io.getUser(token[1]);
      if (!user || !UUID.test(user.id)) return reply(401, 'Autenticación necesaria');
      if (!user.confirmed) return reply(403, 'Confirma tu correo');
      // Limitar el flujo de bytes, sin confiar en Content-Length.
      const reader = req.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 2048) { await reader.cancel(); return reply(400, 'Solicitud inválida'); }
          chunks.push(part.value);
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body: Record<string, unknown>;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply(400, 'Solicitud inválida'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).sort().join(',') !== 'attemptId,courseId' ||
          typeof body.courseId !== 'string' || !UUID.test(body.courseId) ||
          typeof body.attemptId !== 'string' || !UUID.test(body.attemptId)) return reply(400, 'Solicitud inválida');
      if (!config.enabled || !config.termsVersion?.trim()) return reply(409, 'Compra no disponible');
      const app = new URL(config.appOrigin);
      if (app.origin !== config.appOrigin || !config.origins.includes(app.origin) ||
          !(app.protocol === 'https:' || app.origin === 'http://localhost:4200')) throw new Error();
      const offer = await io.offer(user.id, body.courseId);
      if (!offer) return reply(409, 'Compra no disponible');
      if (offer.owned) return reply(409, 'Curso ya adquirido');
      if (!UUID.test(offer.price_id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(offer.slug) ||
          !/^price_[A-Za-z0-9]+$/.test(offer.provider_price_id) ||
          !Number.isSafeInteger(offer.amount_minor) || offer.amount_minor <= 0 ||
          !/^[A-Z]{3}$/.test(offer.currency)) return reply(409, 'Compra no disponible');
      const price = await io.price(offer.provider_price_id);
      if (!price.active || price.type !== 'one_time' || price.recurring != null ||
          price.currency !== offer.currency.toLowerCase() || price.unit_amount !== offer.amount_minor) {
        return reply(409, 'Compra no disponible');
      }
      const input = new TextEncoder().encode(`${user.id.toLowerCase()}:${body.courseId.toLowerCase()}:${body.attemptId.toLowerCase()}`);
      const digest = await crypto.subtle.digest('SHA-256', input);
      const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const url = await io.create({
        price: offer.provider_price_id,
        success: `${app.origin}/mis-cursos?checkout=success`,
        cancel: `${app.origin}/cursos/${offer.slug}`,
        metadata: { user_id: user.id, course_id: body.courseId, price_id: offer.price_id, attempt_id: body.attemptId, terms_version: config.termsVersion },
      }, key);
      if (!url || new URL(url).protocol !== 'https:' || new URL(url).hostname !== 'checkout.stripe.com') throw new Error();
      return Response.json({ url }, { headers });
    } catch {
      return reply(500, 'No se pudo completar la operación');
    }
  };
}
