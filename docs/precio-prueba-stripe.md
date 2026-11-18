# Precio de prueba de Stripe (checkout en modo test)

Registro de alcance. La migración `20261117240000_stripe_test_price_ref.sql` y la
prueba `supabase/tests/0013_stripe_test_price_ref.psql` están versionadas y se
validaron con la suite SQL sobre PGlite en memoria; la migración figura entre las
aplicadas en DEV según informe (historial de la CLI sin reconciliar), sin aplicar
a producción. No contiene claves ni secretos.

## Estado

- La sesión de pago está **abierta solo en TEST** en DEV (`CHECKOUT_ENABLED=true`,
  `MODE=test`, guarda fail-closed y reversible); la migración no la activa ni
  concede derechos. Stripe live sigue desactivado: la guarda exige modo `test` y
  una clave `sk_test_`, por lo que `sk_live_` nunca abre la rama.
- `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` están configurados **a mano** como
  secretos en servidor/Edge Functions en DEV; no se versionan ni se ponen en
  clientes ni en `environment.local.ts`.
- El cobro en modo TEST con la tarjeta 4242 **ya se probó** (verificado en
  DEV/TEST): 1 orden pagada, 1 derecho activo y 1 evento `processed`. La
  observación de UI del price es `unit_amount=100`, EUR y pago único
  (`prod_VeEc1h7IQd6TOO`); el estado `active` **no quedó confirmado por UI**, así
  que el handler consulta la API de Stripe en runtime y exige `active`,
  `one_time`, sin `recurring`, moneda e importe iguales a la BD antes de crear la
  sesión. Ningún valor se fija desde el cliente ni se asume de la migración.
- El webhook firmado e idempotente está **desplegado en DEV y verificado en
  TEST**: la firma se validó de forma indirecta con la compra real (el handler la
  exige antes de conceder) y el evento quedó `processed`. No hay E2E en
  producción ni Stripe live. La página de éxito no concede acceso. Ver
  `docs/checkout-estado.md` y `docs/webhook-estado.md`.

## Identificador y ubicación

- `price_1Ucw9AFgkhzJRwtxnyxifKAo`: precio de **Stripe TEST del promotor**,
  1,00 EUR, pago único. No es un secreto, pero se guarda únicamente en
  `private.course_price_refs` (esquema privado, solo servidor).
- No va a Angular, a `public.courses` ni a la respuesta pública del catálogo.
  En `public.course_prices` solo vive el importe legible (100 céntimos, EUR).
- La migración es idempotente y no destructiva: actúa solo sobre el curso
  publicado con `slug='peimer-pasodoble'` y sin precio activo; si ya existe un
  precio activo o el price está enlazado a otro curso, no sustituye nada (y en
  el segundo caso falla con mensaje explícito).

## Precio comercial

El precio comercial real y sus condiciones siguen **pendientes de decisión
(D7)**; tampoco hay una política de impuestos aprobada. Este valor es
exclusivamente de prueba en modo test y no debe presentarse como oferta
definitiva ni usarse para cobros reales. Los packs y ofertas están solo
documentados, no implementados.
