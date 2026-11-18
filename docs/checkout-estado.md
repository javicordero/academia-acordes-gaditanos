# Estado del checkout (fundación)

Registro público y breve de alcance. Describe una **fundación preparada en local**,
no un flujo de pago operativo. No contiene claves de cuenta, precios reales ni
datos de prueba de Stripe. Pedidos, snapshot y webhook están versionados, pero
**no desplegados ni probados en real**; no hay cobros ni consentimiento activo.

## Estado actual

- La sesión de pago queda **deliberadamente deshabilitada**: el valor literal
  `enabled: false` en la Edge Function impide crear sesiones. No es un bloqueo
  permanente: se mantiene hasta que se cumplan las precondiciones de abajo.
- Orden implementado en código, **no activo**: identidad de Auth →
  `reserve_checkout_order` reserva el pedido → se consulta el precio real a
  Stripe y se comprueban `active`, `one_time`, importe y moneda → se crea la
  sesión con `metadata.order_id` y clave de idempotencia canónica →
  `bind_checkout_session` confirma actor, pedido e `id` real de sesión →
  **sólo entonces** se devuelve la URL. Sin reserva o sin bind inyectados el
  controlador responde 409; si el bind falla, hay conflicto o la sesión/URL no
  son confiables, responde 500 sin URL ni id. La URL no concede acceso.
- Código versionado: `supabase/functions/create-checkout/` (controlador, entrada
  y pruebas) y las migraciones `20261117190000`, `20261117200000` y
  `20261117220000`; pruebas `supabase/tests/0008`, `0009`, `0011` y `0017`.
- La oferta se calcula en base de datos (función `security definer`, servicio
  únicamente `service_role`) y los importes se verifican en servidor. El
  controlador valida origen, JWT, confirmación de correo, tamaño de cuerpo y
  forma del cuerpo, y deriva la clave de idempotencia desde el ámbito canónico
  usuario/curso/intento: un reintento recupera la misma sesión y la misma
  snapshot. Los metadatos enviados al proveedor contienen solo identificadores y
  la versión de condiciones; **no incluyen correos ni otros datos personales**.
- Nada de esto está desplegado. Los secretos del proveedor se leen en servidor
  desde variables de entorno; no hay claves ni precios reales en el repositorio.

## Verificación

- Pruebas unitarias del controlador con **Node + mocks** (`vitest`), sin llamadas
  a Deno ni al runtime de Stripe: cubren reserva, bind, already_bound, rechazo
  de otra sesión, URL inválida sin bind y reintento con clave estable. No son
  pruebas E2E con Stripe.
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
