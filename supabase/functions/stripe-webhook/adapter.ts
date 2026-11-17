import type { Dependencies } from './handler.ts';

export function createDependencies(stripe: any, cryptoProvider: any, client: any): Dependencies {
  return {
    verify: (body, signature, secret) => stripe.webhooks.constructEventAsync(body, signature, secret, 300, cryptoProvider),
    async record(event) {
      const { data, error } = await client.rpc('record_stripe_event', {
        p_event_id: event.eventId, p_event_type: event.eventType, p_live_mode: event.liveMode,
        p_hash: event.hash, p_session_id: event.sessionId, p_order_id: event.orderId,
      });
      if (error || !['created', 'received_unprocessed', 'processed'].includes(data)) throw new Error('Registro no disponible');
      return data;
    },
  };
}
