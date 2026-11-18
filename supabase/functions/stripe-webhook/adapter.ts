import type { Dependencies, Fulfillment, Recorded } from './handler.ts';
import { FULFILLMENTS, RECORDED } from './handler.ts';

const currency = /^[A-Z]{3}$/;
const resultOf = <T extends string>(data: unknown, allowed: readonly T[], error: string): T => {
  if (typeof data !== 'string' || !allowed.includes(data as T)) throw new Error(error);
  return data as T;
};

// Todas las llamadas usan service_role en servidor. Las credenciales y los
// secretos se leen del entorno en index.ts; nunca llegan al cliente.
export function createDependencies(stripe: any, cryptoProvider: any, client: any): Dependencies {
  return {
    verify: (body, signature, secret) => stripe.webhooks.constructEventAsync(body, signature, secret, 300, cryptoProvider),
    async record(event) {
      const { data, error } = await client.rpc('record_stripe_event', {
        p_event_id: event.eventId, p_event_type: event.eventType, p_live_mode: event.liveMode,
        p_hash: event.hash, p_session_id: event.sessionId, p_order_id: event.orderId,
      });
      if (error) throw error;
      return resultOf<Recorded>(data, RECORDED, 'Registro no disponible');
    },
    // Lectura mínima del pedido por su id (service_role). No concede nada.
    // Sin respuesta utilizable se lanza: el handler responde 503 sin conceder.
    // Cero filas significa que no hay pedido elegible (ack sin concesión).
    async order(orderId, sessionId) {
      const { data, error } = await client.rpc('server_checkout_order_for_event', {
        p_order: orderId, p_session: sessionId,
      });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Pedido no disponible');
      if (data.length === 0) return { known: false, userId: null, amountMinor: null, currency: null };
      if (data.length !== 1) throw new Error('Pedido ambiguo');
      const row = data[0] ?? {};
      const { user_id: userId, amount_minor: amountMinor, currency: code } = row;
      if (typeof userId !== 'string' || !Number.isSafeInteger(amountMinor) ||
          amountMinor < 0 || typeof code !== 'string' || !currency.test(code.toUpperCase())) {
        throw new Error('Pedido inválido');
      }
      return { known: true, userId, amountMinor: amountMinor as number, currency: code };
    },
    // Única escritura de la concesión: la RPC transaccional ya versionada.
    // Stripe envía la moneda en minúsculas; el guard SQL exige tres mayúsculas.
    // Normalizar aquí no cambia el importe ni relaja el cotejo del snapshot.
    async fulfill(facts) {
      const code = facts.currency.toUpperCase();
      if (!currency.test(code) || !Number.isSafeInteger(facts.amountMinor) ||
          facts.amountMinor < 0 || (facts.taxMinor !== null &&
            (!Number.isSafeInteger(facts.taxMinor) || facts.taxMinor < 0 || facts.taxMinor > facts.amountMinor))) {
        throw new Error('Hechos de pago inválidos');
      }
      const { data, error } = await client.rpc('fulfill_paid_event', {
        p_event_id: facts.eventId, p_order: facts.orderId, p_session: facts.sessionId,
        p_actor: facts.userId, p_amount_minor: facts.amountMinor,
        p_currency: code, p_tax_minor: facts.taxMinor,
      });
      if (error) throw error;
      return resultOf<Fulfillment>(data, FULFILLMENTS, 'Resultado desconocido');
    },
  };
}
