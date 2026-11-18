# Precio de prueba de Stripe (checkout en modo test)

Registro de alcance. Es código **local**, **no aplicado a ningún proyecto
Supabase remoto**: la migración `20261117240000_stripe_test_price_ref.sql` y la
prueba `supabase/tests/0013_stripe_test_price_ref.psql` solo se han verificado
con la suite SQL sobre PGlite en memoria.

## Estado

- La sesión de pago sigue **deshabilitada** (`enabled: false` en la Edge
  Function `create-checkout`). La migración no la activa ni concede derechos.
- Faltan `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`, que se pondrán **a mano**
  como secretos en servidor/Edge Functions; no se versionan ni se ponen en
  clientes ni en `environment.local.ts`.
- Falta **probar el cobro en modo test con la tarjeta 4242**. Verificada la
  comprobación operativa del promotor (price activo, pago único, sin recurring,
  EUR y `unit_amount=100`), no está asumida por la migración.
- No hay webhook firmado e idempotente operativo: la página de éxito no concede
  acceso. Ver `docs/checkout-estado.md` para las precondiciones pendientes.

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
(D7)**. Este valor es exclusivamente de prueba en modo test y no debe
presentarse como oferta definitiva ni usarse para cobros reales.
