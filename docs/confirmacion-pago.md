# Núcleo SQL de confirmación: cableado y desplegado en DEV, verificado en TEST

Tres RPC de `service_role` sostienen el flujo: `bind_checkout_session` fija la
sesión real al pedido reservado, `server_checkout_order_for_event` lee el actor y
los importes canónicos y `fulfill_paid_event` concede el derecho en una sola
transacción. `server_checkout_pending_state` (migración `20261117280000`, aplicada
en DEV según informe, con el historial de la CLI sin reconciliar; no en
producción) sólo clasifica una reserva pre-bind para permitir un reintento; no
concede ni vincula. Los handlers están cableados a estas RPC y **desplegados en
DEV con los gates TEST activos** (`CHECKOUT_ENABLED=true`, `MODE=test`, guarda
fail-closed y reversible; `whsec` configurado en servidor; live imposible con la
guarda). La compra E2E en TEST con tarjeta 4242 dejó 1 orden pagada, 1 derecho
activo y 1 evento `processed` (verificado en DEV/TEST). No hay cobro real ni
Stripe live; no hay E2E en producción.

El servidor verifica firma y modo, exige `payment_status=paid`, `mode=payment` e
importe/moneda presentes en el evento, y sólo entonces envía un DTO de hechos
contrastados. SQL no recibe JSON del cliente ni verifica la firma; la firma se
validó de forma indirecta con la compra real en TEST (el handler la exige antes
de conceder). El pago asíncrono y las sesiones vencidas/canceladas ya tienen su
tratamiento; en cambio los reembolsos y contracargos **no están implementados** y
quedan pendientes de decisión (D4). Una reserva caducada no puede vincularse, y
un pago tardío tras el vencimiento queda para conciliación manual, no se concede
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

PGlite valida lógica secuencial, no concurrencia real; la integración con
Supabase/Stripe en TEST ya se verificó con la compra E2E (verificado en
DEV/TEST). Antes de activar pagos en producción/live siguen pendientes las
pruebas multiconexión PostgreSQL (concurrencia real), la revisión de seguridad,
la reconciliación, el consentimiento, las decisiones legales y la política de
impuestos. La página de éxito no concede acceso.
