import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import Stripe from 'npm:stripe@23.1.0';
import { makeHandler } from './handler.ts';
import { disabledResponse, loadCheckoutRuntime } from '../_shared/test-gate-env.ts';

// Sólo entorno del SERVIDOR: nunca petición, cuerpo ni configuración de Angular.
// Ningún flag se activa en este repositorio.
const runtime = loadCheckoutRuntime(name => Deno.env.get(name));

function enabledHandler(): (request: Request) => Promise<Response> {
  const { origins, appOrigin, termsVersion, allowHttpTestOrigin, supabaseUrl, supabaseServiceRoleKey, stripeSecretKey } = runtime.config;
  // La guarda garantiza que los secretos están presentes; la forma de la URL,
  // el allowlist y la validez legal de los términos siguen siendo competencia
  // del controlador. Aquí no se fabrica ni se aprueba ninguna versión.
  const client = createClient(supabaseUrl!, supabaseServiceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const stripe = new Stripe(stripeSecretKey!, { httpClient: Stripe.createFetchHttpClient() });
  return makeHandler({
    async getUser(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, confirmed: !!data.user.email_confirmed_at };
    },
    async offer(user, course) {
      const { data, error } = await client.rpc('checkout_offer', { p_actor: user, p_course: course });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async price(id) { return await stripe.prices.retrieve(id); },
    // Reserva service_role: crea el pedido y el snapshot antes de la sesión.
    async reserve(user, course, attemptId, ttlSeconds) {
      const { data, error } = await client.rpc('reserve_checkout_order', {
        p_actor: user, p_course: course, p_attempt: attemptId, p_ttl_seconds: ttlSeconds,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      // Sólo se extrae la versión del snapshot privado: nunca se expone el
      // snapshot completo ni se añade consentimiento alguno desde el servidor.
      const snap: unknown = row.snapshot;
      const terms = snap && typeof snap === 'object' && !Array.isArray(snap)
        ? (snap as Record<string, unknown>).terms_version
        : undefined;
      return { order_id: row.order_id, terms_version: typeof terms === 'string' ? terms : undefined };
    },
    // La idempotencia de la clave canónica evita duplicar la sesión si el
    // navegador reintenta la misma petición; un intento nuevo es otra compra.
    async create(input, key) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items: [{ price: input.price, quantity: 1 }],
        success_url: input.success, cancel_url: input.cancel, metadata: input.metadata,
        allow_promotion_codes: false, adaptive_pricing: { enabled: false },
      }, { idempotencyKey: key });
      if (typeof session.id !== 'string') throw new Error('Sesión sin id');
      return { id: session.id, url: session.url ?? null };
    },
    // Estado REAL de la sesión, consultado sólo en el servidor. Ante cualquier
    // duda (red, forma inesperada) se devuelve null: el handler cierra la puerta
    // y no abre un intento nuevo. No se registran datos del proveedor.
    async sessionStatus(sessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (typeof session.status !== 'string') return null;
        const metadata: Record<string, string> = {};
        for (const [key, value] of Object.entries(session.metadata ?? {})) {
          if (typeof value === 'string') metadata[key] = value;
        }
        return {
          status: session.status,
          paymentStatus: session.payment_status ?? null,
          metadata,
          url: session.url ?? null,
        };
      } catch {
        return null;
      }
    },
    // Vincula la sesión al pedido reservado. El actor es el usuario de Auth ya
    // verificado por el handler (no metadata de cliente) y la RPC revalida
    // pedido, intento, estado y caducidad bajo bloqueo.
    async bind(user, order, sessionId) {
      const { data, error } = await client.rpc('bind_checkout_session', {
        p_actor: user, p_order: order, p_session: sessionId,
      });
      if (error) throw error;
      if (data !== 'bound' && data !== 'already_bound' && data !== 'binding_conflict') {
        throw new Error('Enlace no disponible');
      }
      return data;
    },
    // Recuperación ante binding conflict: la BD devuelve la sesión ya vinculada
    // sólo si el pedido sigue pendiente, abierto y pertenece al actor. Nunca
    // concede nada y expone únicamente un id opaco ya conocido por Stripe.
    async boundSession(user, order) {
      const { data, error } = await client.rpc('server_checkout_bound_session', {
        p_actor: user, p_order: order,
      });
      if (error || typeof data !== 'string') return null;
      return data;
    },
  }, {
    origins, appOrigin, enabled: true, termsVersion, allowHttpTestOrigin,
  });
}

// Producción NO habilitada: la fila de términos no existe y la decisión legal
// sigue pendiente. Sin los flags TEST exactos se conserva el 409 anterior y no
// se instancian SDK ni cliente de base de datos: cero llamadas de compra.
const serve = runtime.gate.enabled
  ? enabledHandler()
  : () => Promise.resolve(disabledResponse('checkout'));
Deno.serve(serve);
