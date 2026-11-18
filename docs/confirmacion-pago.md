# Núcleo SQL de confirmación: conectado en local, sin activar

Tres RPC de `service_role` sostienen el flujo: `bind_checkout_session` fija la
sesión real al pedido reservado, `server_checkout_order_for_event` lee el actor y
los importes canónicos y `fulfill_paid_event` concede el derecho en una sola
transacción. `server_checkout_pending_state` (migración `20261117280000`, aún no
aplicada a ninguna base remota) sólo clasifica una reserva pre-bind para permitir
un reintento; no concede ni vincula. Los handlers ya están cableados a estas RPC
en código, pero **ambos entrypoints siguen con `enabled: false`, sin desplegar y
sin cobros ni cuenta real**.

El servidor verifica firma y modo, exige `payment_status=paid`, `mode=payment` e
importe/moneda presentes en el evento, y sólo entonces envía un DTO de hechos
contrastados. SQL no recibe JSON del cliente ni verifica la firma. El pago
asíncrono, las sesiones vencidas/canceladas, los reembolsos y los contracargos
siguen pendientes de decisión: una reserva caducada no puede vincularse, y un
pago tardío tras el vencimiento queda para conciliación manual, no se concede
automáticamente.

El evento se bloquea antes del pedido; una clave transaccional serializa por
usuario/curso y el índice de derechos activos impide duplicados. Se cotejan la
sesión, el evento recibido, el pedido, el comprador, importe, moneda y línea
con el snapshot. El impuesto desconocido permanece NULL y un valor conocido
solo se establece una vez; no se decide fiscalidad. Sin cuenta, se devuelve
`requires_manual_review` y se deja el evento sin procesar. Un derecho anterior
de otro pedido produce `already_entitled`, conserva el derecho y registra el
pago; no aplica reembolso. Se añade solo `fulfillment_result` privado para
conservar la trazabilidad del resultado por evento. No hay derechos nuevos
para un pedido ya pagado cuyo derecho se haya revocado. Un segundo evento de la
misma sesión/pedido se registra pero devuelve `already_paid` o
`already_processed`: no duplica el derecho; el recibo `received_unprocessed` de
un evento llegado antes del bind puede procesarse una sola vez después de él.

PGlite valida lógica secuencial, no concurrencia real: se requieren pruebas
multiconexión PostgreSQL y pruebas integradas Supabase/Stripe sandbox, revisión
de seguridad, reconciliación, consentimiento y decisiones legales antes de
activar pagos. La página de éxito no concede acceso.
