# Recepción del webhook: implementación local, sin desplegar

**Estado real:** la función sigue **deshabilitada** (`enabled: false`) y **no desplegada**. El `whsec` de test está pendiente de configurarse a mano como secreto de la función; no hay cuenta, claves ni pruebas con Stripe real. Nada de lo descrito aquí significa que los pagos estén listos.

La firma se verifica con Stripe SDK 23.1.0 (misma versión que checkout) y se rechazan cuerpo alterado, firma ausente, fechas fuera de tolerancia y `livemode` distinto del esperado (sólo test). Se registra el id y tipo de evento, modo, hash SHA-256 de los bytes originales, sesión y pedido; nunca el payload, correos ni datos de pago. Los tipos no soportados y los eventos que no cumplen las comprobaciones comerciales se ack con 200 sin concesión.

## Contrato de fulfillment

Sólo se intenta la concesión para `checkout.session.completed` con `payment_status='paid'` o para `checkout.session.async_payment_succeeded`, siempre con `mode='payment'` y un `metadata.order_id` con forma UUID. El usuario **no** se toma de `metadata.user_id`: se obtiene de la BD mediante la RPC de lectura `server_checkout_order_for_event(order_id, session_id)` (migración `20261117250000_webhook_order_lookup.sql`, añadida porque `fulfill_paid_event` exige actor e importes y el cuerpo del proveedor no es fuente de verdad; no relaza ningún guard y la concesión sigue siendo transaccional). Esa RPC devuelve cero filas si el pedido no existe, no está ligado a esa sesión o no cuadra con su línea/snapshot; no expone títulos, precios de proveedor ni datos personales.

A la RPC `fulfill_paid_event` se le pasan el id del evento, el `order_id` validado, el id de sesión, el usuario leído de la BD, el importe y la moneda (del cuerpo si vienen y son válidos; si falta alguno, de la BD) y el impuesto (`NULL` cuando no viene). Stripe envía la moneda en minúsculas y el guard SQL exige tres mayúsculas: el adaptador normaliza sólo la caja antes de llamar a la RPC, sin alterar importes. Importes enteros no negativos y monedas de tres letras se validan antes de registrar; un impuesto negativo, mayor que el total o con forma inválida se rechaza sin inventar cero. La RPC vuelve a cotejar todo contra el snapshot inmutable bajo bloqueo.

## Respuestas

- **200 (recibo aceptado):** `fulfilled`, `already_paid`, `already_entitled`, `already_processed`; también los casos definitivos sin concesión `requires_manual_review`, `missing_order` y `receipt_bound_to_other_user`, que se registran con log estructurado sin PII. Stripe no los reintenta: quedan para revisión manual. Igualmente se ack sin fulfillment un evento ya `processed`, un tipo no soportado, un estado de pago distinto, otro `mode` o un pedido no elegible.
- **400 (sin fulfillment ni registro):** firma/modo/tiempo inválidos, `metadata.order_id` ausente o mal formado, importe/moneda/impuesto con forma inválida. Para el `order_id` se eligió 400 frente a un ack silencioso: un evento pagado que no se puede vincular a un pedido necesita intervención explícita; ack 200 lo escondería. 400 no provoca reintento de Stripe, por lo que el log estructurado (`eventId` + código fijo) es la señal de revisión.
- **503 (sin fulfillment y sin estado cambiado):** fallo de registro, de lectura del pedido o de la RPC (incluidos `invalid payment`, `order mismatch`, `actor mismatch` y errores de BD) y resultados inesperados. La RPC es transaccional: un error no deja derechos ni pedidos a medias. La respuesta no filtra mensajes privados.

La doble concesión se evita en tres capas: el registro previo devuelve `processed` y el handler no vuelve a llamar a `fulfill`; la RPC es idempotente (`already_processed`, `already_paid`, `already_entitled`) y el índice único de derechos activos impide duplicarlos. Un duplicado pendiente (`received_unprocessed`) sí reintenta fulfillment, que decide de forma atómica.

## Pruebas y gate de activación

`npm run test:functions` cubre firma sintética con SDK real, mocks puros de E/S y sin red: no prueba Supabase, PostgREST ni Stripe real. La lógica SQL se valida con PGlite (`npm run test:sql`), sin concurrencia real. Antes de activar: aplicar y revisar las migraciones en Supabase local, configurar el `whsec` y el resto de secretos a mano, decidir el entorno y el modo, revisar conciliación de pagos asíncronos, reembolsos y contracargos, cerrar fiscalidad/legal, hacer pruebas de integración en sandbox con Stripe y de seguridad, y poner `verify_jwt = false` **sólo en esta función**. La página de éxito nunca concede acceso.
