import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import Stripe from 'npm:stripe@23.1.0';
import { makeHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
if (!url || !key || !stripeKey) throw new Error('Configuración de servidor ausente');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });
const origins = (Deno.env.get('CHECKOUT_ALLOWED_ORIGINS') ?? 'http://localhost:4200').split(',').map(x => x.trim()).filter(Boolean);
const appOrigin = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:4200';

Deno.serve(makeHandler({
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
    return data?.[0] ?? null;
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
}, {
  origins, appOrigin,
  // Bloqueo deliberado: faltan snapshot inmutable, consentimiento y webhook.
  enabled: false,
  termsVersion: Deno.env.get('CHECKOUT_TERMS_VERSION'),
}));
