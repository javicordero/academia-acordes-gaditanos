# Estado del checkout (fundación)

Registro público y breve de alcance. Describe una **fundación preparada en local**,
no un flujo de pago operativo. No contiene claves de cuenta, precios reales ni
datos de prueba de Stripe. Pedidos, snapshot y webhook están versionados, pero
**no desplegados ni probados en real**; no hay cobros ni consentimiento activo.

## Estado actual

- La sesión de pago sigue **cerrada**. La versión inicial desplegada en DEV
  mantiene el literal `enabled: false`; en local esa decisión pasa por una guarda
  TEST con fail-closed, pero **sin flags explícitos sigue respondiendo 409** y no
  crea sesiones. No es un bloqueo permanente: se mantiene hasta que se cumplan
  las precondiciones de abajo.
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
- La versión inicial desplegada en DEV sigue deshabilitada. Los secretos del
  proveedor se leen en servidor desde variables de entorno; no hay claves ni
  precios reales en el repositorio.

## Guard TEST local y variables de entorno

Los módulos `supabase/functions/_shared/test-gates.ts` y `test-gate-env.ts` son
**sólo locales, aún no redeployados**. Los index locales pasan únicamente
`Deno.env` del servidor: nunca leen petición, cuerpo ni configuración Angular.
No hay ningún flag activado en este repositorio.

| Variable | Contrato para abrir la rama TEST | Por defecto |
|---|---|---|
| `CHECKOUT_ENABLED` | string `'true'` exacto | ausente ⇒ cerrado |
| `CHECKOUT_MODE` | exactamente `'test'`; `'live'`, otra casing o ausente cierran | ausente ⇒ cerrado |
| `STRIPE_SECRET_KEY` | clave secreta real `sk_test_...` con sufijo y sin whitespace; `sk_test_unused`, `pk_`, `sk_live_` o espacios cierran | ausente ⇒ cerrado |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | presencia en servidor | ausentes ⇒ cerrado |
| `CHECKOUT_TERMS_VERSION` | versión **presente**; comprobar presencia no aprueba legalmente unas condiciones | fila/valor ausente en DEV |
| `CHECKOUT_ALLOWED_ORIGINS`, `APP_ORIGIN` | allowlist y origen ya validados en el handler | `http://localhost:4200` |

Con la gate cerrada no se instancian SDK ni cliente de base de datos: la
respuesta sigue siendo el 409 «Compra no disponible» de siempre. La fila de
términos en BD está **ausente** y la decisión legal sigue **pendiente**: no se ha
fabricado ni insertado versión alguna. Las migraciones aplicadas en DEV, según
informe, son 19/20/21/22/24/25/28, pero el historial de la CLI **no está
reconciliado**. No se afirma prueba E2E ni cobro real.

### Retorno del pago (sólo marcas locales)

La URL de éxito lleva únicamente `checkout=success` y el `order_id` **reservado
en servidor**: ni usuario, importe, sesión ni credenciales. En `/mis-cursos` la
comprobación es **sólo lectura**: contrasta pedidos y derechos propios bajo RLS
(`orders`, `order_items`, `entitlements`), distingue `pending`, `confirmed`,
`notavailable` y `error`, y **nunca concede acceso**: la query no grant. Los
estados `pending` se reintentan como máximo cuatro veces con esperas acotadas de
1500/3000/6000 ms y, si agotan, solo hay reintento manual. No hay botón de
compra, prueba E2E real ni flags `enabled`/términos inventados: la decisión
remota sigue en manos del operador cloud y no se registra aquí ningún cambio de
estado desplegado.

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
