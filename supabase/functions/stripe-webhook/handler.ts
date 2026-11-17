export type EventRecord = { eventId: string; eventType: string; liveMode: boolean; hash: string; sessionId: string | null; orderId: string | null };
export type Dependencies = {
  verify(body: Uint8Array, signature: string, secret: string): Promise<any>;
  record(event: EventRecord): Promise<'created' | 'received_unprocessed' | 'processed'>;
};
const limit = 256 * 1024;
const allowed = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (status: number) => new Response(null, { status });

async function readBody(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export function makeHandler(deps: Dependencies, config: { enabled: boolean; secret?: string; expectedLiveMode: boolean; now?: () => number }) {
  return async (request: Request): Promise<Response> => {
    if (!config.enabled || !config.secret) return response(503);
    if (request.method !== 'POST') return response(405);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return response(415);
    const signature = request.headers.get('stripe-signature');
    if (!signature) return response(400);
    let body: Uint8Array;
    try { body = await readBody(request); } catch { return response(413); }
    let event: any;
    try {
      event = await deps.verify(body, signature, config.secret);
      // Stripe SDK comprueba antigüedad, pero no rechaza timestamps futuros.
      const timestamp = signature.split(',').map(x => x.trim()).find(x => x.startsWith('t='))?.slice(2);
      if (!timestamp || !/^\d+$/.test(timestamp) || Number(timestamp) > Math.floor((config.now?.() ?? Date.now()) / 1000) + 300) return response(400);
    } catch { return response(400); }
    if (!event || typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) ||
        typeof event.type !== 'string' || typeof event.livemode !== 'boolean') return response(400);
    if (event.livemode !== config.expectedLiveMode) return response(400);
    if (!allowed.has(event.type)) return response(200);
    const object = event.data?.object;
    if (!object || typeof object.id !== 'string' || !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(object.id)) return response(400);
    const order = object.metadata?.order_id;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), x => x.toString(16).padStart(2, '0')).join('');
    try {
      const status = await deps.record({ eventId: event.id, eventType: event.type, liveMode: event.livemode, hash, sessionId: object.id, orderId: typeof order === 'string' && uuid.test(order) ? order : null });
      return response(status === 'processed' ? 200 : 503);
    } catch { return response(503); }
  };
}
