# Recepción del webhook: desplegado en DEV, verificado en TEST

**Estado real:** el webhook está desplegado en DEV y verificado en TEST: la firma
se validó de forma indirecta con una compra real en modo TEST, que dejó pedido
pagado, derecho activo y evento procesado (verificado en DEV/TEST). La guarda
TEST fail-closed mantiene `enabled` solo en TEST y reversible; no hay E2E en
producción ni Stripe live (decisión pendiente). Nada de lo descrito aquí
significa que los pagos comerciales estén listos.

La firma se verifica con Stripe SDK 23.1.0 (misma versión que checkout) y se rechazan cuerpo alterado, firma ausente, fechas fuera de tolerancia y `livemode` distinto del esperado (sólo test). Se registra el id y tipo de evento, modo, hash SHA-256 de los bytes originales, sesión y pedido; nunca el payload, correos ni datos de pago. Los tipos no soportados y los eventos que no cumplen las comprobaciones comerciales se ack con 200 sin concesión.

## Contrato de fulfillment

Sólo se intenta la concesión para `checkout.session.completed` con `payment_status='paid'` o para `checkout.session.async_payment_succeeded`, siempre con `mode='payment'` y un `metadata.order_id` con forma UUID. El usuario **no** se toma de `metadata.user_id`: se obtiene de la BD mediante la RPC de lectura `server_checkout_order_for_event(order_id, session_id)` (migración `20261117250000_webhook_order_lookup.sql`, añadida porque `fulfill_paid_event` exige actor e importes y el cuerpo del proveedor no es fuente de verdad; no relaza ningún guard y la concesión sigue siendo transaccional). Esa RPC devuelve cero filas si el pedido no existe, no está ligado a esa sesión o no cuadra con su línea/snapshot; no expone títulos, precios de proveedor ni datos personales.

El importe (`amount_total`, entero no negativo y ≤ 2147483647, límite del tipo `integer` de SQL, no una decisión de negocio) y la moneda **deben venir en el evento firmado**: son la evidencia del cobro. Falta, fracción, negativo o valor fuera de rango ⇒ 400 sin registro ni consulta a la RPC; **nunca** se sustituyen por el snapshot de la BD, porque eso sería una tautología. Stripe envía la moneda en minúsculas y el guard SQL exige tres mayúsculas: el adaptador normaliza sólo la caja. Antes de conceder se compara con los valores ya devueltos por la RPC de lectura; si difieren, se ack sin llamar a fulfillment y queda pendiente de conciliación manual (no se marca procesado). La RPC `fulfill_paid_event` recibe esos hechos exactos, el usuario de la BD, la sesión y el impuesto (`NULL` si `total_details` o `amount_tax` faltan o son `null`) y vuelve a cotejarlos contra el snapshot inmutable bajo bloqueo. El impuesto es opcional y su política está pendiente: `0` se conserva como cero, pero no se estima ni se sustituye un importe por él; un valor negativo, fraccionario, textual, mayor que el total o fuera de `integer` se rechaza.

Cuando la lectura canónica no encuentra pedido con esa sesión, el adaptador consulta `server_checkout_pending_state(order, session, amount, currency)` (migración `20261117280000_pending_checkout_lookup.sql`, `security definer`, `search_path=''`, ejecución sólo de `service_role`). Esa RPC **no concede ni vincula**: deriva el intento del pedido, exige reserva de Stripe abierta, no caducada y con snapshot coherente, y compara los hechos monetarios del evento. No recibe `metadata.user_id` ni actor del cliente. Devuelve `pending` (503 reintentable) o `unresolvable` (ACK); una sesión ya vinculada a otra sesión, un pedido ajeno o un importe distinto son definitivos. Antes del bind no existe sesión en BD que cotejar: un `sessionId` arbitrario en un evento firmado sólo puede reintentarse hasta el bind o el vencimiento de la reserva; se documenta como límite, no se auto-vincula nada. Tras el bind, la lectura canonical exige coincidencia exacta de sesión.

## Respuestas

- **200 (recibo aceptado):** `fulfilled`, `already_paid`, `already_entitled`, `already_processed`; también los casos definitivos sin concesión `requires_manual_review`, `missing_order` y `receipt_bound_to_other_user`, que se registran con log estructurado sin PII y quedan para revisión manual. La ausencia de concesión no depende de que Stripe reintente o no: cualquier entrega no-2xx puede volver a intentarse. Igualmente se ack sin fulfillment un evento ya `processed`, un tipo no soportado, un estado de pago distinto, otro `mode`, un pedido no elegible, una reserva `unresolvable` y unos hechos monetarios que no coinciden con la BD (sin marcar procesado).
- **400 (sin fulfillment ni registro):** firma/modo/tiempo inválidos, `metadata.order_id` ausente o mal formado, importe o moneda **ausentes** o con forma inválida, impuesto con forma inválida. Para el `order_id` se eligió 400 frente a un ack silencioso: un evento pagado que no se puede vincular a un pedido necesita intervención explícita; ack 200 lo escondería. Stripe puede reintentar entregas no-2xx: el log estructurado (`eventId` + código fijo) es la señal de revisión, no una promesa de ausencia de reintentos.
- **503 (sin fulfillment y sin estado cambiado):** fallo de registro, de lectura del pedido o de la RPC (incluidos `invalid payment`, `order mismatch`, `actor mismatch` y errores de BD), fallo al clasificar la reserva y, sobre todo, `pending` pre-bind. La RPC es transaccional: un error no deja derechos ni pedidos a medias ni marca el recibo como procesado; el mismo evento puede volver a procesarse tras el bind. La respuesta no filtra mensajes privados.

La doble concesión se evita en tres capas: el registro previo devuelve `processed` y el handler no vuelve a llamar a `fulfill`; la RPC es idempotente (`already_processed`, `already_paid`, `already_entitled`) y el índice único de derechos activos impide duplicarlos. Un duplicado pendiente (`received_unprocessed`) sí reintenta fulfillment, que decide de forma atómica.

## Guard TEST local y variables de entorno

Los módulos `supabase/functions/_shared/test-gates.ts` y `test-gate-env.ts`
están **desplegados en DEV y verificados en TEST**. El index local pasa únicamente `Deno.env`
del servidor: nunca petición, cuerpo ni configuración Angular. No hay flags
activados en este repositorio.

| Variable | Contrato para abrir la rama TEST | Por defecto |
|---|---|---|
| `STRIPE_WEBHOOK_ENABLED` | string `'true'` exacto | ausente ⇒ cerrado |
| `CHECKOUT_MODE` | exactamente `'test'`; `'live'`, otra casing o ausente cierran | ausente ⇒ cerrado |
| `STRIPE_WEBHOOK_SECRET` | prefijo `whsec_` con sufijo sin whitespace; la forma criptográfica la valida Stripe | configurado en DEV, firma verificada en TEST |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | presencia para el cliente de servidor (`clientAvailable`) | ausentes ⇒ cerrado |
| `STRIPE_SECRET_KEY` | opcional; si se pasa debe ser `sk_test_...` real, sin `sk_test_unused`, `pk_`, `sk_live_` ni espacios | el placeholder del SDK nunca satisface la guarda |

Con la gate cerrada no se construyen SDK, cliente ni verificador: la respuesta
sigue siendo el 503 de siempre. El webhook **puede activarse en TEST sin checkout
ni términos** para probar la firma; eso no crea compras ni derechos.
`expectedLiveMode` es `false` fijo, sin variable de entorno que lo cambie.
Migraciones aplicadas en DEV según informe: 19/20/21/22/24/25/28; el historial
de la CLI **no está reconciliado**. La compra E2E en TEST sí se completó y el
evento quedó procesado (verificado en DEV/TEST); no hay E2E en producción.

## Pruebas y gate de activación

`npm run test:functions` cubre firma sintética con SDK real, mocks puros de E/S y sin red: no prueba Supabase, PostgREST ni Stripe real. La lógica SQL se valida con PGlite (`npm run test:sql`), sin concurrencia real. La prueba de integración en sandbox con Stripe ya se hizo: firma verificada de forma indirecta y evento procesado (verificado en DEV/TEST); no hay E2E en producción. Antes de activar en producción: revisar conciliación de pagos asíncronos, reembolsos y contracargos, cerrar fiscalidad/legal, completar la verificación de seguridad y decidir el entorno y el modo (decisión pendiente), y poner `verify_jwt = false` **sólo en esta función**. La página de éxito nunca concede acceso.
