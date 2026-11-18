// Recepción del webhook: la firma y el modo se comprueban antes que cualquier
// concesión. El derecho lo decide únicamente la RPC transaccional de la BD;
// este archivo no confía en metadata.user_id ni en importes del cuerpo para
// conceder, sólo los usa como hechos que la RPC vuelve a cotejar.
export type EventRecord = { eventId: string; eventType: string; liveMode: boolean; hash: string; sessionId: string | null; orderId: string | null };
export type Recorded = 'created' | 'received_unprocessed' | 'processed';
export const RECORDED: readonly Recorded[] = ['created', 'received_unprocessed', 'processed'];
/** La BD puede devolver el evento lógico canónico cuando otro id comparte sesión. */
export type RecordedReceipt = { status: Recorded; eventId: string };
export type NoGrant = { eventId: string; sessionId: string; eventType: string };

// Datos mínimos del pedido leídos de la BD a partir de metadata.order_id.
// `known=false` significa que la consulta terminó pero no hay pedido elegible
// con esa sesión vinculada; un fallo de consulta se lanza y el handler responde 503.
export type OrderLookup = { known: boolean; userId: string | null; amountMinor: number | null; currency: string | null };
// Estado de una reserva NUESTRA aún no vinculada. Sólo decide si el evento se
// puede reintentar; nunca concede ni completa el derecho ni fija la sesión.
//  pending        pedido de Stripe con intento abierto, snapshot coherente y
//                 hechos monetarios del evento iguales a los de la BD.
//  unresolvable   no existe, es ajeno, está cerrado/caducado/y vinculado a otra
//                 sesión o los hechos del evento no pueden casar nunca.
export type Reservation = 'pending' | 'unresolvable';
export type Fulfillment =
  | 'fulfilled' | 'already_paid' | 'already_entitled' | 'already_processed'
  | 'requires_manual_review' | 'missing_order' | 'receipt_bound_to_other_user';
export const FULFILLMENTS: readonly Fulfillment[] = [
  'fulfilled', 'already_paid', 'already_entitled', 'already_processed',
  'requires_manual_review', 'missing_order', 'receipt_bound_to_other_user',
];
export type Facts = {
  eventId: string; orderId: string; sessionId: string;
  userId: string; amountMinor: number; currency: string; taxMinor: number | null;
};
/** Hechos monetarios del evento firmado. `amount` manda; el resto lo contradice o confirma. */
type MoneyFacts = {
  amount: number; currency: string; tax: number | undefined;
  subtotal: number | undefined; discount: number | undefined;
};
export type Dependencies = {
  verify(body: Uint8Array, signature: string, secret: string): Promise<any>;
  /** Acepta la RPC antigua (texto) y la canónica (estado + id lógico). */
  record(event: EventRecord): Promise<Recorded | RecordedReceipt>;
  order(orderId: string, sessionId: string): Promise<OrderLookup>;
  /** Clasificación de la reserva previa al bind; opcional: sin ella se ACK. */
  reservation?(orderId: string, sessionId: string, amountMinor: number, currency: string): Promise<Reservation | null>;
  /** Marca un recibo como NO concedido; opcional para mocks antiguos. */
  noGrant?(mark: NoGrant): Promise<unknown>;
  fulfill(facts: Facts): Promise<Fulfillment>;
};
export type Config = { enabled: boolean; secret?: string; expectedLiveMode: boolean; now?: () => number };

const limit = 256 * 1024;
const allowed = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
// Resultados definitivos de la RPC: se aceptan sin concesión nueva ni reintento.
const blocked = new Set<Fulfillment>(['requires_manual_review', 'missing_order', 'receipt_bound_to_other_user']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sessionId = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const money = /^[A-Za-z]{3}$/;
// Límite técnico del esquema (columnas y parámetros `integer`), no una decisión
// de producto: un importe mayor nunca debe llegar a la RPC ni a fulfillment.
export const SQL_INT_MAX = 2147483647;
const response = (status: number, headers?: Record<string, string>) => new Response(null, { status, headers });
const nonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= SQL_INT_MAX;
const object = (value: unknown): Record<string, any> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
// Log mínimo y estructurado: id de evento y código fijo. Nunca cuerpo, correo,
// importes, moneda, pedido ni usuario; el error privado no se devuelve.
const log = (status: number, eventId: string, reason: string) =>
  console.error(JSON.stringify({ webhook: 'stripe', status, eventId, reason }));

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

// Aplica un evento ya firmado y contrastado. Todo el estado lo decide la BD:
// el registro previo, la lectura del pedido y la RPC transaccional.
async function fulfillment(
  deps: Dependencies, event: any, object: any, orderId: string,
  hash: string, facts: MoneyFacts,
): Promise<number> {
  const eventId: string = event.id;
  let recorded: Recorded;
  let canonicalEventId = eventId;
  try {
    const receipt = await deps.record({
      eventId, eventType: event.type, liveMode: event.livemode, hash,
      sessionId: object.id, orderId,
    });
    if (typeof receipt === 'string') {
      recorded = receipt;
    } else {
      recorded = receipt.status;
      if (typeof receipt.eventId === 'string' && /^evt_[A-Za-z0-9]+$/.test(receipt.eventId)) {
        canonicalEventId = receipt.eventId;
      }
    }
  } catch { log(503, eventId, 'record_error'); return 503; }
  if (!RECORDED.includes(recorded)) { log(503, eventId, 'record_invalid'); return 503; }
  // Un recibo ya procesado no vuelve a llamar a fulfillment: la primera
  // ejecución ya aplicó la RPC de forma transaccional.
  if (recorded === 'processed') return 200;

  const { amount, currency, tax, subtotal, discount } = facts;
  // Un recibo que no concede queda registrado como NO concedido: no bloquea
  // recompra (un recibo 'received' sin derecho nunca es estado terminal).
  const noGrant = async (reason: string): Promise<number> => {
    if (typeof deps.noGrant === 'function') {
      try {
        await deps.noGrant({ eventId: canonicalEventId, sessionId: object.id, eventType: event.type });
      } catch { log(503, eventId, 'no_grant_error'); return 503; }
    }
    log(200, eventId, reason);
    return 200;
  };

  // (2) Consistencia interna del evento firmado. `amount_total` es la evidencia
  // del cobro y NUNCA se sustituye por el snapshot: estos campos sólo la
  // confirman o la contradicen. Descuento con ofertas aún no implementadas.
  if (subtotal !== undefined && amount !== subtotal + (tax ?? 0) - (discount ?? 0)) {
    return noGrant('amount_mismatch');
  }
  if (discount !== undefined && discount > 0) return noGrant('unexpected_discount');

  let found: OrderLookup;
  try { found = await deps.order(orderId, object.id); }
  catch { log(503, eventId, 'order_lookup_error'); return 503; }
  if (!found.known) {
    // Pre-bind: sólo se reintenta una reserva NUESTRA abierta y coherente. La
    // clasificación la hace SQL a partir del pedido y de los hechos del evento;
    // metadata.user_id NO se usa: no identifica al actor ni puede conceder.
    if (typeof deps.reservation === 'function' && nonNegative(amount) &&
        typeof currency === 'string' && money.test(currency)) {
      let state: Reservation | null;
      try { state = await deps.reservation(orderId, object.id, amount, currency.toUpperCase()); }
      catch { log(503, eventId, 'reservation_error'); return 503; }
      if (state === 'pending') { log(503, eventId, 'unbound_session'); return 503; }
    }
    log(200, eventId, 'missing_order'); return 200;
  }
  if (typeof found.userId !== 'string' || !uuid.test(found.userId)) {
    log(200, eventId, 'missing_order'); return 200;
  }

  const amountMinor = amount;
  const value = currency;
  if (!nonNegative(amountMinor) || typeof value !== 'string' || !money.test(value)) {
    log(503, eventId, 'facts_invalid'); return 503;
  }
  if (!nonNegative(found.amountMinor) || typeof found.currency !== 'string') {
    log(503, eventId, 'lookup_invalid'); return 503;
  }
  // La comparación definitiva con el snapshot la hace la RPC bajo bloqueo.
  // Este cotejo previo evita reintentos infinitos: se marca como no concedido.
  if (amountMinor !== found.amountMinor || value.toUpperCase() !== found.currency.toUpperCase()) {
    return noGrant('facts_mismatch');
  }
  if (tax !== undefined && (!nonNegative(tax) || tax > amountMinor)) {
    log(400, eventId, 'invalid_tax'); return 400;
  }

  let result: Fulfillment;
  try {
    result = await deps.fulfill({
      eventId: canonicalEventId, orderId, sessionId: object.id, userId: found.userId,
      amountMinor, currency: value, taxMinor: tax === undefined ? null : tax,
    });
  } catch { log(503, eventId, 'fulfillment_error'); return 503; }
  if (!FULFILLMENTS.includes(result)) { log(503, eventId, 'result_invalid'); return 503; }
  if (blocked.has(result)) log(200, eventId, result);
  return 200; // fulfilled/already_* y los casos sin concesión son definitivos.
}

export function makeHandler(deps: Dependencies, config: Config) {
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
      // El SDK comprueba antigüedad, pero no rechaza timestamps futuros.
      const timestamp = signature.split(',').map(x => x.trim()).find(x => x.startsWith('t='))?.slice(2);
      if (!timestamp || !/^\d+$/.test(timestamp) || Number(timestamp) > Math.floor((config.now?.() ?? Date.now()) / 1000) + 300) return response(400);
    } catch { return response(400); }
    if (!event || typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id) ||
        event.id.length > 255 || typeof event.type !== 'string' ||
        typeof event.livemode !== 'boolean') return response(400);
    if (event.livemode !== config.expectedLiveMode) return response(400);
    if (!allowed.has(event.type)) return response(200);

    const obj = object(event.data?.object);
    if (!obj || typeof obj.id !== 'string' || !sessionId.test(obj.id) || obj.id.length > 255) return response(400);
    // Sólo un checkout completado y pagado, o el evento asíncrono de éxito.
    if (event.type === 'checkout.session.completed' && obj.payment_status !== 'paid') return response(200);
    if (obj.mode !== 'payment') return response(200);

    const meta = object(obj.metadata);
    const orderId = meta?.order_id;
    // Un pedido ausente o malformado en un evento pagado no se acepta en silencio:
    // no se registra ni se concede; se exige intervención manual (400, sin reintento).
    if (typeof orderId !== 'string' || !uuid.test(orderId)) {
      log(400, event.id, 'invalid_order_id'); return response(400);
    }

    // Importe y moneda son obligatorios: un evento pagado sin ellos es
    // malformado y no se ack-ea ni se concede.
    const amount = obj.amount_total;
    if (amount === undefined) { log(400, event.id, 'missing_amount'); return response(400); }
    if (!nonNegative(amount)) {
      log(400, event.id, 'invalid_amount'); return response(400);
    }
    const currency = obj.currency;
    if (currency === undefined) { log(400, event.id, 'missing_currency'); return response(400); }
    if (typeof currency !== 'string' || !money.test(currency)) {
      log(400, event.id, 'invalid_currency'); return response(400);
    }
    // El impuesto es opcional y su política está pendiente: null/ausente se
    // traduce a NULL en SQL (jamás a 0 ni a una estimación). Importes con forma
    // inválida son 400 sin registro; una INCONSISTENCIA entre campos firmados
    // es definitiva y se marca como no concedida (ver `fulfillment`).
    const details = object(obj.total_details);
    const rawTax = details ? details.amount_tax : undefined;
    const tax = rawTax === null || rawTax === undefined ? undefined : rawTax;
    if (tax !== undefined && (!nonNegative(tax) || tax > amount)) {
      log(400, event.id, 'invalid_tax'); return response(400);
    }
    const rawSubtotal = obj.amount_subtotal !== undefined
      ? obj.amount_subtotal : (details ? details.amount_subtotal : undefined);
    const subtotal = rawSubtotal === null || rawSubtotal === undefined ? undefined : rawSubtotal;
    if (subtotal !== undefined && !nonNegative(subtotal)) {
      log(400, event.id, 'invalid_subtotal'); return response(400);
    }
    const rawDiscount = details && details.amount_discount !== undefined
      ? details.amount_discount : obj.amount_discount;
    const discount = rawDiscount === null || rawDiscount === undefined ? undefined : rawDiscount;
    if (discount !== undefined && !nonNegative(discount)) {
      log(400, event.id, 'invalid_discount'); return response(400);
    }

    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), x => x.toString(16).padStart(2, '0')).join('');
    // 503 reintentable: el evento ya tiene recibo (created) pero la sesion aun
    // no esta vinculada. Stripe reintenta; el recibo y el hash se conservan, asi
    // que el mismo evento podra procesarse una sola vez tras el bind.
    const status = await fulfillment(deps, event, obj, orderId, hash,
      { amount, currency, tax, subtotal, discount });
    return response(status);
  };
}
