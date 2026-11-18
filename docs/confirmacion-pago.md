# Núcleo SQL de confirmación: no conectado

Dos RPC de `service_role` vinculan una sesión a la reserva vigente y aplican
atómicamente un evento de pago contrastado. No hay cambios en los handlers:
checkout y webhook siguen deshabilitados. No se ha conectado ni probado ningún
proveedor, gateway ni cuenta real.

El servidor futuro debe verificar firma y modo, recuperar y contrastar la sesión
y sus líneas, y comprobar `payment_status=paid`, `mode=payment`, titular y
metadatos antes de llamar con un DTO de hechos contrastados. SQL no recibe JSON
del cliente ni verifica la firma. Debe hacerse una revisión explícita de eventos
asíncronos, sesiones vencidas/canceladas, reembolsos y contracargos antes de
activar; una reserva caducada no puede vincularse, pero un pago ya vinculado
puede llegar después del vencimiento y exige conciliación de proveedor.

El evento se bloquea antes del pedido; una clave transaccional serializa por
usuario/curso y el índice de derechos activos impide duplicados. Se cotejan la
sesión, el evento recibido, el pedido, el comprador, importe, moneda y línea
con el snapshot. El impuesto desconocido permanece NULL y un valor conocido
solo se establece una vez; no se decide fiscalidad. Sin cuenta, se devuelve
`requires_manual_review` y se deja el evento sin procesar. Un derecho anterior
de otro pedido produce `already_entitled`, conserva el derecho y registra el
pago; no aplica reembolso. Se añade solo `fulfillment_result` privado para
conservar la trazabilidad del resultado por evento. No hay derechos nuevos
para un pedido ya pagado cuyo derecho se haya revocado.

PGlite valida lógica secuencial, no concurrencia real: se requieren pruebas
multiconexión PostgreSQL y pruebas integradas Supabase/Stripe sandbox, revisión
de seguridad, reconciliación, consentimiento y decisiones legales antes de
activar pagos. La página de éxito no concede acceso.
