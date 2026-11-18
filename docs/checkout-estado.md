# Estado del checkout (fundación)

Registro público y breve de alcance. Describe una **fundación preparada en local**,
no un flujo de pago operativo. No contiene claves de cuenta, precios reales ni
datos de prueba de Stripe. Pedidos, snapshot y webhook están versionados, pero
**no desplegados ni probados en real**; no hay cobros ni consentimiento activo.

## Estado actual

- La sesión de pago queda **deliberadamente deshabilitada**: el valor literal
  `enabled: false` en la Edge Function impide crear sesiones. No es un bloqueo
  permanente: se mantiene hasta que se cumplan las precondiciones de abajo.
- Orden previsto, **no activo**: `reserve_checkout_order` reserva el pedido →
  se crea la sesión con `metadata.order_id` → el webhook verificado e
  idempotente concede el derecho por `order_id`. Sin la dependencia de reserva
  inyectada, el controlador responde 409 y no llama a Stripe `create`: no se
  crea una sesión que el webhook no podría conciliar.
- Código versionado: `supabase/functions/create-checkout/` (controlador, entrada
  y pruebas), la migración `20261117190000_checkout_offer.sql` y la prueba
  `supabase/tests/0008_checkout_offer.psql`.
- La oferta se calcula en base de datos (función `security definer`, servicio
  únicamente `service_role`) y los importes se verifican en servidor. El
  controlador valida origen, JWT, confirmación de correo, tamaño de cuerpo y
  forma del cuerpo, y deriva la clave de idempotencia en servidor. Los metadatos
  enviados al proveedor contienen solo identificadores y la versión de
  condiciones; **no incluyen correos ni otros datos personales**.
- Nada de esto está desplegado. Los secretos del proveedor se leen en servidor
  desde variables de entorno; no hay claves ni precios reales en el repositorio.

## Verificación

- Pruebas unitarias del controlador con **Node + mocks** (`vitest`), sin llamadas
  a Deno ni al runtime de Stripe.
- Prueba SQL de la oferta con **PGlite en memoria** (`npm run test:sql`), sobre
  migraciones y `supabase/tests/*.psql`, con `ROLLBACK`. Esto valida lógica SQL y
  permisos, no Supabase/Auth/PostgREST reales.

## Precondiciones para habilitar el cobro (futuro)

No se activará el flujo hasta que existan, al menos:

- **Pedido inmutable**: registro de pedido/precio como fuente de verdad, no
  calculable de novo en el cliente.
- **Webhook verificado e idempotente**: firma comprobada y tratamiento
  idempotente; la página de éxito nunca concede acceso por sí sola.
- **Concurrencia**: comportamiento correcto ante reintentos y solicitudes
  simultáneas.
- **Legal**: snapshot inmutable de condiciones y registro de consentimiento, con
  la decisión pendiente resuelta.
- **Modo de prueba**: verificación en modo test del proveedor antes de cualquier
  cobro real.

Estas decisiones siguen pendientes en el plan de producto; este documento no las
da por cerradas ni promete protección absoluta ni disponibilidad perpetua.
