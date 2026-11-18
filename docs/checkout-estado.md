# Estado del checkout (fundación)

Registro público y breve de alcance. Describe una **fundación verificada en
DEV/TEST**, no un flujo de cobro comercial activo. No contiene claves de cuenta,
precios reales ni datos de prueba de Stripe. Pedidos, snapshot y webhook están
versionados y probados en TEST (pedido pagado, derecho activo y evento
procesado); no hay E2E en producción ni consentimiento legal aprobado.

## Estado actual

- La sesión de pago está **abierta solo en TEST y es reversible**: `enabled` se
  activó en DEV para la compra de prueba (verificado en DEV/TEST), con guarda
  fail-closed y modo TEST. Sin esos flags sigue respondiendo 409 y no crea
  sesiones. Stripe live sigue desactivado (decisión pendiente).
- Orden implementado en código, **activo solo en TEST**: identidad de Auth →
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
- La versión desplegada en DEV se habilitó solo para TEST (reversible); la
  configuración del proveedor se lee en servidor desde variables de entorno; no
  hay claves ni precios reales en el repositorio.

## Guard TEST local y variables de entorno

Los módulos `supabase/functions/_shared/test-gates.ts` y `test-gate-env.ts`
están **desplegados en DEV y verificados en TEST**. Los index locales pasan únicamente
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
| `CHECKOUT_ALLOW_HTTP_TEST_ORIGIN` | literal `'true'` exacto; sólo surte efecto con la guarda TEST abierta y `APP_ORIGIN` exacto en el allowlist | ausente ⇒ sin HTTP nuevo |

Con la gate cerrada no se instancian SDK ni cliente de base de datos: la
respuesta sigue siendo el 409 «Compra no disponible» de siempre. La fila de
términos en BD está **ausente** y la decisión legal sigue **pendiente**: no se ha
fabricado ni insertado versión alguna. Las migraciones aplicadas en DEV, según
informe, son 19/20/21/22/24/25/28, pero el historial de la CLI **no está
reconciliado**. La compra E2E en TEST sí se completó (verificado en DEV/TEST);
no hay cobro real ni E2E en producción.

### Prueba técnica DEV (sandbox verificado en TEST, sin condiciones aprobadas)

Esta rama existe únicamente para verificar el flujo técnico en DEV con Stripe
en modo TEST. No es una apertura comercial: aquí no se aprueban precios, no se
redactan políticas, no hay consentimiento ni aceptación de condiciones.

Configuración exacta del servidor de la Edge Function (los secretos se ponen en
el entorno del servidor, **nunca** en el repositorio):

| Variable | Valor DEV de prueba |
|---|---|
| `CHECKOUT_ENABLED` | `true` |
| `CHECKOUT_MODE` | `test` (exacto; `live` u otra casing cierran) |
| `STRIPE_SECRET_KEY` | clave `sk_test_...` real de prueba, **sólo en servidor** |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | valores DEV, **sólo en servidor** |
| `CHECKOUT_TERMS_VERSION` | `sandbox-no-contract-v1` (marcador QA, ver abajo) |
| `APP_ORIGIN` | `http://100.108.147.80:4200` |
| `CHECKOUT_ALLOWED_ORIGINS` | `http://100.108.147.80:4200` (el mismo origen exacto) |
| `CHECKOUT_ALLOW_HTTP_TEST_ORIGIN` | `true` (literal exacto) |

El flag HTTP está apagado por defecto y **no** puede activarse desde petición,
cuerpo, query ni cabecera. Sólo surte efecto cuando la guarda TEST está abierta
y `APP_ORIGIN` coincide exactamente con una entrada del allowlist. HTTPS y
`http://localhost:4200` conservan su comportamiento anterior. Cualquier otro
HTTP se rechaza con el flag apagado, con `APP_ORIGIN` fuera del allowlist o con
un `Origin` ajeno; las URLs de retorno se construyen siempre desde `APP_ORIGIN`
del servidor, nunca desde el navegador ni desde un parámetro de la URL.

`sandbox-no-contract-v1` es un **marcador técnico de fixture QA**: viaja como
`terms_version` en metadata y en el pedido/snapshot, y significa sólo «prueba
técnica, condiciones no aprobadas». No es un término comercial, no fija precio,
no constituye aceptación ni consentimiento y no autoriza un cobro real. No se ha
añadido ningún checkbox ni texto legal. Producción sigue inhabilitada: la guarda
exige modo `test` y clave `sk_test_`, así que una clave `sk_live_` nunca abre la
rama; no existe fallback automático a este marcador.

Configuración privada coherente (instrucción, **no aplicada**): la versión del
entorno debe coincidir con la fila singleton. `private.checkout_order_config`
tiene `singleton boolean primary key check (singleton)` y `terms_version text
not null` con longitud 1..200. Inserción idempotente y **sólo si la fila está
vacía**, sin sobrescribir una versión ya aprobada ni sembrar precios:

```sql
-- DEV únicamente; ejecutar con privilegios de servidor y tras revisión.
-- Nunca en producción ni en una base remota sin permiso explícito.
insert into private.checkout_order_config (singleton, terms_version)
select true, 'sandbox-no-contract-v1'
where not exists (select 1 from private.checkout_order_config);
```

No se crea nueva migración ni fila de consentimiento. Si la reserva devuelve
`snapshot.terms_version`, el controlador compara ese valor con
`CHECKOUT_TERMS_VERSION` **antes de cualquier llamada a Stripe** y responde 409
si difieren; si el DTO no lo incluye, no se finge la comparación: queda como
límite de coherencia que el operador debe resolver configurando ambos valores.
El webhook conserva su guarda TEST separada y ya se verificó con el pago real en
TEST (verificado en DEV/TEST). Estos cambios están desplegados en DEV; la
aplicación a otros entornos y la decisión legal siguen pendientes.

### Retorno del pago (sólo marcas locales)

La URL de éxito lleva únicamente `checkout=success` y el `order_id` **reservado
en servidor**: ni usuario, importe, sesión ni credenciales. En `/mis-cursos` la
comprobación es **sólo lectura**: contrasta pedidos y derechos propios bajo RLS
(`orders`, `order_items`, `entitlements`), distingue `pending`, `confirmed`,
`notavailable` y `error`, y **nunca concede acceso**: la query no grant. Los
estados `pending` se reintentan como máximo cuatro veces con esperas acotadas de
1500/3000/6000 ms y, si agotan, solo hay reintento manual. La compra E2E en TEST
sí se completó (verificado en DEV/TEST); no hay E2E en producción y la decisión
remota sigue en manos del operador cloud.

### Retorno cancelado y sesión expirada (código local)

La URL de cancelación lleva sólo `?checkout=cancelled` en la ficha del curso. La
ficha muestra el texto «Has vuelto de Stripe. Puedes reanudar la compra de
prueba o consultar Mis cursos.». Es un marcador de navegación: no afirma que no
se cobrara nada, no confirma pagos, no escribe en BD, no concede derechos y no
dispara ninguna petición al montar. El enlace `?comprar=1` del catálogo sigue
siendo una pista sin lector: no activa la compra por query.

Tras una respuesta válida, el servidor devuelve además el id opaco de la sesión
(ya presente en la URL de Stripe) y el intento realmente usado. El cliente
guarda ese **par intento/sesión** por curso en `localStorage` —sin correos,
importes ni identificadores de cuenta— y lo reenvía **sólo en un reintento
iniciado por clic**. El servidor consulta Stripe por ese
id: únicamente si Stripe confirma `status: 'expired'` **y** la metadata de esa
sesión coincide con el usuario, curso e intento canónico actuales, deriva un
intento de recuperación determinista, reserva un pedido nuevo con la RPC ya
existente (que cierra la reserva vencida tras el TTL de 900 s), crea una sesión
con clave de idempotencia distinta y la vincula a ese pedido. El intento
derivado es estable ante doble clic, doble pestaña o recarga; el cambio de
cuenta o de curso descarta la marca antes de navegar.

Todo lo demás cierra la puerta sin abrir otro intento: red caída, respuesta sin
estado verificable (422), estados desconocidos, `complete` —incluidos pagos
asíncronos en curso— y sesiones ajenas (409). Un `url: null` no se interpreta
como «expirada». El reintento ante 422 vuelve a preguntar a Stripe; no crea
reserva ni sesión nueva. No se modifica ninguna orden pagada, derecho, snapshot
ni binding, y no se toca el webhook. No hay migración nueva para checkout: la prueba SQL
`0018` cubre el contrato ya desplegado de intento conocido/conflicto/TTL/derecho
activo. No hay política de reembolso, impago tardío ni precios nuevos; la prueba
se hizo con Stripe en modo TEST (verificado en DEV/TEST), no en producción.

## Verificación

- Pruebas unitarias del controlador con **Node + mocks** (`vitest`), sin llamadas
  a Deno ni al runtime de Stripe: cubren reserva, bind, already_bound, rechazo
  de otra sesión, URL inválida sin bind y reintento con clave estable, además
  del retorno cancelado, la recuperación por `expired` confirmado y el fail-closed
  ante estados no verificables. Se ejecutan con `npm run test:functions`. No son
  pruebas E2E con Stripe.
- Pruebas del cliente (`npm test`): marca opaca por curso, doble clic, cambio de
  cuenta y banner de retorno sin efectos. Tampoco son E2E.
- Prueba SQL de la oferta con **PGlite en memoria** (`npm run test:sql`), sobre
  migraciones y `supabase/tests/*.psql`, con `ROLLBACK`. Esto valida lógica SQL y
  permisos, no Supabase/Auth/PostgREST reales.
- Compra E2E en Stripe TEST realizada por el usuario (verificado en DEV/TEST):
  pedido pagado, derecho activo y evento procesado. No hay E2E en producción.

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
- **Modo de prueba**: verificación en modo TEST ya realizada (verificado en
  DEV/TEST); Stripe live y el cobro real siguen pendientes (decisión pendiente).

Estas decisiones siguen pendientes en el plan de producto; este documento no las
da por cerradas ni promete protección absoluta ni disponibilidad perpetua.
