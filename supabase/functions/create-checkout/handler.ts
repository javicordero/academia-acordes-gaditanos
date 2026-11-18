import { canonicalAttemptId } from './attempt.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Stripe entrega el id de sesión; el bind lo valida otra vez en SQL.
const SESSION = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
/** Vigencia de la reserva que precedes a la sesión de pago (60..86400 en la RPC). */
export const RESERVATION_TTL_SECONDS = 900;
/** Error accionable ante un binding conflict que no se puede recuperar. */
const RECOVERY_ERROR = 'No se pudo recuperar la sesión de pago. Reintenta desde el curso.';
export type Offer = { owned: boolean; slug: string; price_id: string; amount_minor: number; currency: string; provider_price_id: string };
export type Bind = 'bound' | 'already_bound' | 'binding_conflict';
/** `terms_version` llega desde el snapshot de la reserva, nunca del cliente. */
export type Reservation = { order_id: string; terms_version?: string };
/** Estado REAL de Stripe. `null` significa «no verificable», nunca «expirado». */
export type SessionState = {
  status: string;
  paymentStatus?: string | null;
  metadata?: Record<string, string> | null;
  /** URL REAL devuelta por Stripe al recuperar una sesión ya vinculada. */
  url?: string | null;
};
export interface Dependencies {
  getUser(token: string): Promise<{ id: string; confirmed: boolean } | null>;
  offer(user: string, course: string): Promise<Offer | null>;
  price(id: string): Promise<{ active: boolean; currency: string; unit_amount: number | null; type: string; recurring: unknown }>;
  /** Debe existir antes de crear la sesión: el webhook concilia por order_id. */
  reserve?(user: string, course: string, attemptId: string, ttlSeconds: number): Promise<Reservation | null>;
  create(input: { price: string; success: string; cancel: string; metadata: Record<string, string> }, key: string):
    Promise<{ id: string; url: string | null } | null>;
  /** Vincula sesión y pedido en servidor. Sólo hechos ya verificados. */
  bind?(user: string, order: string, sessionId: string): Promise<Bind>;
  /** Consulta a Stripe por id de sesión. Nunca se fía del reloj ni del navegador. */
  sessionStatus?(sessionId: string): Promise<SessionState | null>;
  /** Sesión ya vinculada en BD, recuperable sólo en servidor (service_role). */
  boundSession?(user: string, order: string): Promise<string | null>;
}

export type HandlerConfig = {
  origins: string[];
  appOrigin: string;
  enabled: boolean;
  termsVersion?: string;
  /**
   * Sólo TEST: lo activa el index cuando la guarda TEST está abierta y el flag
   * de entorno es el literal 'true'. Nunca se lee de petición, cuerpo ni query.
   */
  allowHttpTestOrigin?: boolean;
};

/**
 * Origen de retorno: configuración del SERVIDOR, nunca petición. HTTPS y
 * http://localhost:4200 conservan su comportamiento; cualquier otro HTTP
 * exige el flag TEST explícito Y estar en el allowlist. Sin credentials,
 * fragmento, ruta ni query: app.origin debe ser exactamente appOrigin.
 */
function appUrl(config: HandlerConfig): URL {
  const app = new URL(config.appOrigin);
  if (app.origin !== config.appOrigin || !config.origins.includes(app.origin)) throw new Error();
  if (app.protocol === 'https:' || app.origin === 'http://localhost:4200') return app;
  if (config.allowHttpTestOrigin === true && app.protocol === 'http:') return app;
  throw new Error();
}

/** Sólo HTTPS de Stripe, sin credenciales, ruta adicional ni fragmento. */
function trustedSessionUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') return null;
    return url.toString();
  } catch { return null; }
}

/**
 * No hay derives de intento en el cliente ni en el marker de sesión: el
 * sucesor de un intento cerrado lo deriva la BD de forma determinista dentro de
 * `reserve_checkout_order`. El marcador `sessionId` sólo añade una verificación
 * con Stripe; con o sin él, el flujo de reserva es exactamente el mismo.
 */

export function makeHandler(io: Dependencies, config: HandlerConfig) {
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
      const keys = body && typeof body === 'object' && !Array.isArray(body)
        ? Object.keys(body).sort().join(',') : '';
      const withSession = keys === 'attemptId,courseId,sessionId';
      // `attemptId` se valida por forma para no romper al cliente actual, pero
      // NO es autoridad: se ignora salvo como pista al contrastar metadata en
      // recuperación. El intento real se deriva abajo de Auth + curso.
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          !(keys === 'attemptId,courseId' || withSession) ||
          typeof body.courseId !== 'string' || !UUID.test(body.courseId) ||
          typeof body.attemptId !== 'string' || !UUID.test(body.attemptId) ||
          (withSession && (typeof body.sessionId !== 'string' || !SESSION.test(body.sessionId)))) {
        return reply(400, 'Solicitud inválida');
      }
      if (!config.enabled || !config.termsVersion?.trim()) return reply(409, 'Compra no disponible');
      // Sin reserva ni bind del servidor no se puede conciliar el pago en el
      // webhook: mejor 409 que una sesión que la BD nunca aceptaría.
      if (typeof io.reserve !== 'function' || typeof io.bind !== 'function') return reply(409, 'Compra no disponible');
      const app = appUrl(config);
      const offer = await io.offer(user.id, body.courseId);
      if (!offer) return reply(409, 'Compra no disponible');
      if (offer.owned) return reply(409, 'Curso ya adquirido');
      if (!UUID.test(offer.price_id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(offer.slug) ||
          !/^price_[A-Za-z0-9]+$/.test(offer.provider_price_id) ||
          !Number.isSafeInteger(offer.amount_minor) || offer.amount_minor <= 0 ||
          !/^[A-Z]{3}$/.test(offer.currency)) return reply(409, 'Compra no disponible');

      // Intento canónico: SOLO identidad verificada + curso. El body no decide.
      const attemptId = canonicalAttemptId(user.id, body.courseId);
      // Recuperación con marcador: el propio Stripe debe confirmar el estado de
      // la sesión anterior. Es una comprobación ADDITIVA; NO deriva ningún
      // intento. Sin marcador, un intento cerrado se recupera exactamente igual
      // (la BD devuelve su sucesor determinista). El navegador nunca decide.
      let expiredSession: string | null = null;
      if (withSession) {
        if (typeof io.sessionStatus !== 'function') return reply(409, 'Compra no disponible');
        let seen: SessionState | null = null;
        try { seen = await io.sessionStatus(body.sessionId as string); }
        catch { seen = null; }
        if (!seen || typeof seen.status !== 'string') {
          return reply(422, 'No se pudo confirmar el estado de la sesión de pago');
        }
        const meta = seen.metadata ?? {};
        if (meta.user_id !== user.id || meta.course_id !== body.courseId ||
            meta.attempt_id !== body.attemptId) {
          return reply(409, 'Compra no disponible');
        }
        // `complete` incluye pagos asíncronos en proceso: ni se reanuda ni se
        // sustituye. Cualquier estado no reconocido tampoco autoriza reserva.
        if (seen.status === 'complete') return reply(409, 'Compra no disponible');
        if (seen.status !== 'open' && seen.status !== 'expired') {
          return reply(422, 'No se pudo confirmar el estado de la sesión de pago');
        }
        if (seen.status === 'expired') expiredSession = body.sessionId as string;
      }
      // El pedido se reserva en servidor ANTES de cualquier llamada a Stripe;
      // su id viaja en metadata para que el webhook firme e idempotente
      // concilie por order_id. La reserva es la fuente de la versión en BD y la
      // que decide si el intento sigue abierto o necesita un sucesor.
      const reservation = await io.reserve(user.id, body.courseId, attemptId, RESERVATION_TTL_SECONDS);
      if (!reservation || !UUID.test(reservation.order_id)) return reply(409, 'Compra no disponible');
      // Coherencia configuración(env)/BD, SIEMPRE antes de consultar Stripe.
      // Si el DTO no trae la versión no se inventa ninguna: el operador debe
      // mantener ambos valores configurados; comprobar presencia no aprueba
      // condiciones ni otorga consentimiento.
      if (typeof reservation.terms_version === 'string' && reservation.terms_version !== config.termsVersion) {
        return reply(409, 'Compra no disponible');
      }
      const orderId = reservation.order_id;
      // Se revisa Stripe en vivo: la semilla local solo da el identificador.
      const price = await io.price(offer.provider_price_id);
      if (!price.active || price.type !== 'one_time' || price.recurring != null ||
          price.currency !== offer.currency.toLowerCase() || price.unit_amount !== offer.amount_minor) {
        return reply(409, 'Compra no disponible');
      }
      // El retorno solo IDENTIFICA nuestro pedido para que /mis-cursos pueda
      // contrastarlo con la BD bajo RLS. No es una credencial: no concede nada,
      // no viaja el usuario, el importe ni el id de sesión de Stripe.
      const success = new URL('/mis-cursos', app.origin);
      success.searchParams.set('checkout', 'success');
      success.searchParams.set('order_id', orderId);
      // Clave de idempotencia ligada al PEDIDO que la BD devolvió, no al valor
      // del cuerpo. Mientras la reserva siga abierta, el mismo pedido da la
      // misma clave y Stripe reanuda la misma sesión. Si la BD cerró el intento
      // y emitió su sucesor, el order_id cambia y con él la clave: se crea una
      // sesión nueva sin depender de que el cliente conserve ningún marcador.
      const input = new TextEncoder().encode(`checkout-order:${orderId.toLowerCase()}`);
      const digest = await crypto.subtle.digest('SHA-256', input);
      const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      let created: { id: string; url: string | null } | null = null;
      try { created = await io.create({
        price: offer.provider_price_id,
        success: success.toString(),
        // Marcador honesto: sólo identifica el retorno; no afirma importe,
        // estado financiero ni concede acceso. No viaja el order_id.
        cancel: `${app.origin}/cursos/${offer.slug}?checkout=cancelled`,
        metadata: {
          user_id: user.id,
          course_id: body.courseId,
          price_id: offer.price_id,
          attempt_id: attemptId,
          terms_version: config.termsVersion,
          order_id: orderId,
        },
      }, key); } catch { created = null; }
      // Ni el id ni la URL se aceptan sin validación. Una sesión ajena o una
      // URL no confiable se descartan ANTES de tocar la BD: no se vincula nada.
      if (!created || typeof created.id !== 'string' || created.id.length > 255 || !SESSION.test(created.id) ||
          typeof created.url !== 'string') throw new Error();
      // Defensa ante una respuesta Proveedor mal reconstruida: la recuperación
      // nunca debe devolver la misma sesión que Stripe marcó como expirada.
      if (expiredSession && created.id === expiredSession) throw new Error();
      let target: URL;
      try {
        target = new URL(created.url);
        if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') throw new Error();
      } catch { throw new Error(); }
      // La URL sólo se devuelve tras vincular esa misma sesión al pedido. Un
      // error de bind es 500 sin filtrar nada; un binding_conflict (Stripe pudo
      // podar la clave de idempotencia y crear otra sesión) se recupera reusing
      // la sesión ya vinculada, sin conceder derechos ni duplicar cobro.
      let bound: Bind | 'error';
      try { bound = await io.bind(user.id, orderId, created.id); }
      catch { bound = 'error'; }
      if (bound === 'error') throw new Error();

      let finalSession = created.id;
      let finalUrl = target.toString();
      if (bound === 'binding_conflict') {
        if (typeof io.boundSession !== 'function' || typeof io.sessionStatus !== 'function') {
          return reply(409, RECOVERY_ERROR);
        }
        let existing: string | null = null;
        try { existing = await io.boundSession(user.id, orderId); } catch { existing = null; }
        if (typeof existing !== 'string' || !SESSION.test(existing)) return reply(409, RECOVERY_ERROR);
        let seen: SessionState | null = null;
        try { seen = await io.sessionStatus(existing); } catch { seen = null; }
        if (!seen || seen.status !== 'open') return reply(409, RECOVERY_ERROR);
        const meta = seen.metadata ?? {};
        if (meta.user_id !== user.id || meta.course_id !== body.courseId ||
            meta.attempt_id !== attemptId || meta.order_id !== orderId) {
          return reply(409, RECOVERY_ERROR);
        }
        const recovered = trustedSessionUrl(seen.url);
        if (!recovered) return reply(409, RECOVERY_ERROR);
        let rebound: Bind | 'error';
        try { rebound = await io.bind(user.id, orderId, existing); } catch { rebound = 'error'; }
        if (rebound !== 'bound' && rebound !== 'already_bound') return reply(409, RECOVERY_ERROR);
        finalSession = existing;
        finalUrl = recovered;
      } else if (bound !== 'bound' && bound !== 'already_bound') {
        throw new Error();
      }
      // El id es opaco y ya viajaba en la URL de Stripe; el cliente guarda el
      // par intento/sesión REAL para reenviarlo tal cual en el siguiente clic.
      // El intento devuelto es siempre el canónico: el sucesor vive en la BD.
      return Response.json({
        url: finalUrl, sessionId: finalSession, attemptId,
      }, { headers });
    } catch {
      return reply(500, 'No se pudo completar la operación');
    }
  };
}
