# Packs de cursos y ofertas temporales con Stripe: investigación y diseño futuro

Documento de **investigación y diseño para trabajo futuro**. No implementa nada, no
modifica migraciones, funciones, Angular ni configuración, y no aplica nada a ningún
proyecto remoto. Cualquier cifra que aparece (por ejemplo, «un curso», «un pack» o
«un descuento del 20 %») es un **ejemplo ilustrativo para explicar el modelo**, no
un precio, una composición ni una decisión de producto. Las decisiones abiertas se
recogen en la sección 7 y no se dan por cerradas aquí.

## 1. Resumen ejecutivo

- **Pack:** se modela como una **oferta propia en Stripe con un único Price** (una
  sola línea en `line_items` de pago único), no como N líneas ni como un objeto «bundle»
  nativo de Checkout (que no aparece en la API; ver sección 2, inferencia). En
  nuestra base de datos, esa misma oferta se expande a **N `entitlements`**, uno
  por curso incluido, concedidos en una sola transacción por el webhook.
- **Oferta temporal:** se modela como un **descuento aplicado en servidor** al
  crear la sesión (cupón de Stripe referenciado desde servidor, o un Price
  rebajado creado para la ocasión), con una **tabla de promociones** que fija
  vigencia y ámbito. El pedido guarda un **snapshot** con importe base, descuento
  e importe total; el webhook comprueba `amount_total` y
  `total_details.amount_discount` contra ese snapshot antes de conceder acceso.
- **Nunca** se calcula el importe a cobrar en Angular, ni se concede acceso desde
  la página de éxito. La autoridad es la firma del webhook más la RPC
  transaccional en base de datos, como hoy.
- El bloqueo actual no es Stripe sino **nuestra capa SQL mono-oferta**
  (`checkout_offer`, `reserve_checkout_order` y los tres puentes del webhook
  exigen exactamente una línea y un curso por pedido). `order_items` ya es 1→N en
  el esquema, pero el código lo reduce a una sola fila.

## 2. Fuentes consultadas

Fecha de acceso a todas ellas: **2026-11-18**. No se reproducen fragmentos
largos; se parafrasea y se enlaza la fuente.

### Fuentes oficiales (documentación y referencia de API de Stripe)

| Fuente | Qué respalda |
| --- | --- |
| [How products and prices work](https://docs.stripe.com/products-prices/how-products-and-prices-work) | Products describen qué se vende; Prices definen cuánto y cada cuánto. Un Price puede ser `one_time` o `recurring`. Para cambiar un importe se crea un Price nuevo y se archiva el antiguo: los importes históricos son inmutables. Útil para la alternativa «Price rebajado». |
| [Prices (API reference)](https://docs.stripe.com/api/prices) | El campo `type` distingue `one_time` de `recurring`; coincide con la comprobación que ya hace nuestro `create-checkout`. |
| [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create) | `mode=payment`, `line_items`, `discounts` («actualmente se puede especificar como máximo uno»), `metadata`, `client_reference_id`, `success_url`, `cancel_url`, `allow_promotion_codes`, `expires_at`. En `payment` hay hasta 100 `line_items`, pero se recomienda consolidar cuando son muchos. |
| [Checkout Session object](https://docs.stripe.com/api/checkout/sessions/object) | `amount_total`, `currency`, `payment_status`, `status`, `livemode`, `total_details.amount_discount` y `total_details.amount_tax` en la respuesta; base para la verificación del webhook. |
| [Add discounts (Checkout, pago único)](https://docs.stripe.com/payments/checkout/discounts.md?ui=full-page) | Cupones y promotion codes reducen el subtotal; se aplican pasando el ID del cupón en `discounts[0][coupon]` al crear la sesión. Un cupón por sesión de Checkout. Parámetros `max_redemptions`, `redeem_by`, `applies_to`. |
| [Coupons and promotion codes](https://docs.stripe.com/billing/subscriptions/coupons) | Diferencia oficial: el **cupón** lo aplica nuestro backend; el **promotion code** lo introduce el cliente. `duration` solo aplica a suscripciones. El apilamiento de hasta 20 descuentos descrito aquí es de suscripciones/facturas, **no** de una sesión de Checkout. |
| [Fulfill orders](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page) | El cumplimiento **debe** hacerse por webhook (la página de retorno no es fiable); `checkout.session.completed` y `checkout.session.async_payment_succeeded`; la función de fulfillment debe tolerar llamadas múltiples y concurrentes para la misma sesión y registrar el estado. |
| [Manage webhook endpoints / signature](https://docs.stripe.com/webhooks/signature) | Verificar la firma con el cuerpo **crudo** y el `Stripe-Signature`; registrar los IDs de evento para no procesar dos veces el mismo evento; reintentos automáticos hasta tres días; devolver `2xx` rápido; considerar allowlist de IPs. |
| [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | Clave de idempotencia en `POST`; hasta 255 caracteres; evitar datos sensibles (correos o identificadores personales); se recomienda UUID v4 u otra cadena con entropía. Respaldan nuestra clave canónica derivada por SHA-256. |
| [Standalone selling prices](https://docs.stripe.com/revenue-recognition/standalone-selling-price) | El único concepto oficial de «bundle» encontrado pertenece a **Revenue Recognition** (asignación SSP para contabilidad), no a Checkout. No decide cómo se cobra ni cómo se otorga acceso. |
| [Collect tax with Checkout](https://docs.stripe.com/tax/checkout) y [Taxes in Checkout](https://docs.stripe.com/payments/checkout/taxes) | Stripe Tax puede calcular impuestos en pagos únicos y recurrentes dentro de Checkout. Se cita solo como **decisión abierta**; no se activa ni se implementa. |

### Fuentes complementarias (oficiales, pero blog/material comercial; no son referencia de API)

- [Managing SaaS access control with Stripe’s Entitlements API](https://stripe.dev/blog/managing-saas-access-control-with-stripe-entitlements-api) (2024-10-31): describe la Entitlements API de Stripe para planes de suscripción. Se cita como **contraste**: aquí los derechos son filas propias en `public.entitlements` concedidas por nuestro webhook, no funciones de Stripe.
- [Designing flexible payment flows with Checkout Session](https://stripe.dev/blog/designing-flexible-payment-flows-with-checkoutsessions) (2026-03-06): Checkout Session como capa de orquestación sobre PaymentIntent; impuestos, descuentos y multimoneda como parámetros declarativos.
- [Boost sales with a product bundling strategy](https://stripe.com/resources/more/boost-sales-with-a-product-bundling-strategy) (actualizado 2026-09-28): el «bundle» se trata como **estrategia comercial** (agrupar productos y mostrar el ahorro), no como un objeto de la API de pagos.

### Inferencia explícita

No aparece un parámetro u objeto «bundle» en la referencia de Checkout Sessions;
solo `line_items` y `discounts`. El único «bundle» documentado es el contable de
Revenue Recognition. De ahí se **infiere** —no se afirma como dato de Stripe— que
la forma natural de vender un pack aquí es crear para él un Product/Price propio
(un importe, una línea, un recibo) y gestionar la composición en nuestra BD. Esta
inferencia debe revisarse si Stripe publica nuevas capacidades.

## 3. Estado actual de nuestra arquitectura

Contrastado con el código del repositorio; nada de esto se ha cambiado.

- **Oferta hoy:** `public.checkout_offer(p_actor, p_course)` devuelve una única
  oferta de curso (`slug`, `price_id`, `amount_minor`, `currency`,
  `provider_price_id`, `owned`) y exige curso publicado, un precio activo vigente
  y exactamente uno (`1 = count(*)`). No existe noción de pack ni de promoción.
- **Reserva:** `public.reserve_checkout_order(p_actor, p_course, p_attempt,
  p_ttl_seconds)` crea **un** `orders`, **un** `order_items` y un snapshot JSON en
  `private.checkout_attempts` con `course_id`, `course_slug`, `course_title`,
  `price_id`, `amount_minor`, `currency`, `provider`, `provider_price_id` y
  `terms_version`. Usa bloqueos consultivos y una TTL de 60..86400 s. Los
  triggers de `private.protect_checkout_snapshot` congelan importes, moneda,
  curso, precio y términos.
- **Esquema 1→N ya preparado:** `public.order_items` tiene `unique (order_id,
  course_id)` y FK a cursos; `public.entitlements` es uno por usuario y curso
  activo con `order_id` y `order_item_id`. La relación está en
  `docs/arquitectura-datos.md`. El límite está en las RPC, no en las tablas.
- **Checkout (`create-checkout/handler.ts`, `index.ts`):** `mode: 'payment'`,
  una sola línea `{ price, quantity: 1 }`, `success_url`/`cancel_url` desde
  configuración de servidor, `allow_promotion_codes: false`,
  `adaptive_pricing.enabled: false`, metadata con `user_id`, `course_id`,
  `price_id`, `attempt_id`, `terms_version` y `order_id`, y clave de idempotencia
  `SHA256(checkout-order:order_id)`, calculada en servidor a partir del pedido
  devuelto por la reserva (no de `usuario:curso:intento`). Si la BD cierra el
  intento, la RPC deriva el sucesor determinista en base de datos (migración
  `20261118190100`, prueba SQL `0024`) y, al cambiar el `order_id`, cambia la
  clave. La sesión se vincula al pedido con `bind_checkout_session`; el
  navegador solo recibe una URL validada de `checkout.stripe.com`.
- **Webhook (`stripe-webhook/handler.ts`, `adapter.ts`):** verifica la firma con
  el cuerpo crudo y tolerancia de 300 s (más comprobación de timestamp futuro),
  exige `livemode: false` fijo, acepta `checkout.session.completed` y
  `checkout.session.async_payment_succeeded` con `payment_status: 'paid'` y
  `mode: 'payment'`; lee `amount_total` y `currency` del evento firmado,
  `total_details.amount_tax` como opcional y **no lee `amount_discount`**;
  registra el evento por ID y hash SHA-256 en `private.commerce_events` vía
  `record_stripe_event`; obtiene usuario/importe/moneda de la BD con
  `server_checkout_order_for_event`; y concede con `fulfill_paid_event` en una
  transacción con bloqueos. Reintentos: `503` reintentable, `200` definitivo,
  `already_processed`/`already_paid` en repeticiones.
- **Cuello mono-oferta:** `fulfill_paid_event` exige
  `(select count(*) from order_items where order_id = p_order) <> 1` como
  condición de error, lee una sola línea con `select into i` e inserta un solo
  entitlement desde `a.course_id`. Lo mismo hacen
  `server_checkout_order_for_event` y `server_checkout_pending_state`. Cualquier
  pack con N cursos o cualquier descuento que baje `amount_total` respecto al
  snapshot actual sería rechazado o clasificado como `facts_mismatch`.
- **Estado operativo:** checkout/webhook en TEST con compra E2E completada en
  desarrollo; sin Stripe live, sin impuestos activos y sin páginas de éxito que
  concedan acceso (ver `docs/decisiones-producto.md` y
  `docs/arquitectura-datos.md`). La resiliencia del intento cerrado se versiona
  en la migración `20261118190100` con la prueba SQL `0024`.

## 4. Diseño recomendado para packs (propuesta, sin implementar)

1. **Catálogo editorial:** añadir tablas públicas de solo lectura
   `course_bundles` (identificador, `slug`, título, estado y orden),
   `course_bundle_items` (`bundle_id`, `course_id`, `position`, único por par) y
   `bundle_prices` (`bundle_price_id`, importe, moneda, vigencia `valid_from`/
   `valid_to`, activo). Un pack puede contener N cursos; un curso puede pertenecer
   a varios packs. Los precios siguen siendo de escritura solo servidor.
2. **Referencia privada:** `private.bundle_price_refs` con
   `(bundle_price_id, provider = 'stripe', provider_price_id)`, equivalente a
   `private.course_price_refs`. Solo servidor; nunca en Angular ni en tablas
   públicas. El ID del Price de Stripe no viaja al navegador.
3. **Un solo Price para el pack:** el `line_items` de la sesión lleva el Price
   del pack, no los precios de los cursos. Así hay un `amount_total`, un snapshot,
   una clave de idempotencia y una línea de factura coherente. La composición se
   consulta en BD a partir del `offering_id`. (Inferencia de la sección 2.)
4. **RPC con tipo de oferta:** sobrecargar / añadir variantes de
   `checkout_offer` y `reserve_checkout_order` para recibir `offer_id` (UUID) y
   `offer_kind` ('course' | 'bundle'), manteniendo las firmas actuales por
   compatibilidad. La reserva debe:
   - resolver la oferta según `offer_kind`, comprobar publicación y vigencia y
     que no exista ya un derecho que impida la compra (regla a decidir, sección 7);
   - crear un `orders` con el importe total del pack y **N `order_items`**, uno
     por curso, con título e importe congelados;
   - guardar en el snapshot `offer_id`, `offer_kind`, la lista de `course_id` y
     los importes, además de `terms_version` y la referencia del Price;
   - usar bloqueos deterministas y conservar los triggers de inmutabilidad.
5. **Metadata de la sesión:** mantener `order_id` y añadir `offering_id` y
   `offer_kind`, además de `user_id`, `attempt_id`, `price_id` y `terms_version`.
   El `user_id` es un UUID interno, no un correo; no se meten en metadata ni la
   lista de cursos ni importes ni datos personales. La composición se deriva en
   servidor desde la BD.
6. **Fulfillment N en una transacción:** `fulfill_paid_event` debe dejar de exigir
   «exactamente una línea», recorrer todas las `order_items` del pedido e insertar
   un `entitlements` por curso, con el mismo evento, Pedido, sesión e importe
   cotejados. Un índice único parcial evita duplicados por usuario/curso.
7. **Replay idempotente:** el par `(provider, external_event_id)` más el hash del
   cuerpo sigue siendo la barrera; un evento repetido devuelve
   `already_processed` y no concede nada nuevo; un evento distinto para el mismo
   pedido pagado debe resolverse como `already_paid`/`already_entitled` sin
   duplicar derechos. Cualquier divergencia de importe, moneda, sesión o actor
   sigue siendo un error que impide la concesión.

## 5. Diseño recomendado para ofertas temporales (propuesta, sin implementar)

1. **Mecanismo elegido:** aplicar el descuento **en servidor** al crear la sesión,
   con `discounts[0][coupon]` (o `promotion_code`) sobre un Price de catálogo, o
   bien usar un **Price rebajado** creado para la campaña. La documentación
   oficial indica que un checkout de pago único admite **un solo** cupón/código
   por sesión, lo que encaja con la regla «sin apilamiento por defecto».
2. **Alternativa rechazada por ahora:** activar `allow_promotion_codes: true`
   para que el cliente escriba códigos en la página de Stripe. Haría que el
   importe final dependiera de una acción del navegador y obligaría a reconstruir
   todo el snapshot antes de crear la sesión. Hoy está desactivado y la
   recomendación es mantenerlo así salvo decisión expresa y diseño específico.
3. **Tabla de promociones (diseño):** identificador, tipo (`percent` /
   `amount_off`), valor, moneda cuando corresponda, `valid_from`/`valid_to`,
   ámbito (`course` / `bundle` y `offer_id`), `max_redemptions`, estado y
   referencia al cupón/código en una tabla privada. Los identificadores del
   proveedor viven solo en servidor. La vigencia se evalúa con **reloj del
   servidor/BD** (`now()`), nunca con la fecha del navegador ni con la del evento.
4. **Snapshot ampliado:** `base_amount_minor`, `discount_amount_minor`,
   `total_amount_minor`, `currency`, `promotion_id`, además de `terms_version`,
   `provider` y `provider_price_id`. El `amount_total` del pedido es el importe
   **después** de descuento; los importes por línea se congelan también. Los
   triggers de inmutabilidad se extienden a los nuevos campos.
5. **Verificación en el webhook:** el evento firmado debe cumplir
   `amount_total == total_amount_minor` y, cuando haya promoción,
   `total_details.amount_discount == discount_amount_minor`, además de `currency`
   y la sesión vinculada. `amount_tax` sigue siendo opcional y su política,
   pendiente; `null` no se transforma en 0. Un descuento inesperado o una
   discrepancia se rechaza sin concesión.
6. **Sin apilamiento por defecto:** una sola promoción por pedido. Si en el
   futuro se quiere combinar cupón con Price rebajado o con pack, debe decidirse
   explícitamente y revisarse el cálculo del snapshot y del `amount_discount`.

## 6. Matriz de decisiones

| Opción | Cuándo usarla | Ventajas | Inconvenientes | Recomendación para nosotros |
| --- | --- | --- | --- | --- |
| Pack con **un Price único** en Stripe | Cuando el pack se vende como una sola oferta con un importe | Un `amount_total`, un snapshot, una idempotencia, recibo claro; menos cambios en el webhook | La composición vive en nuestra BD, no en Stripe; hay que expandir a N derechos | **Recomendado.** Un Price por pack y N `entitlements`. |
| Pack como **N `line_items`** (un Price por curso) | Catálogo con muchas combinaciones libres o cantidades variables | Stripe muestra cada curso por separado; útil para conciliación por curso | N líneas que validar, importes por línea, más superficie de error; el código actual exige una sola línea | No recomendado ahora. Solo si se decide un carrito real. |
| «Bundle» nativo de Stripe | — | — | No aparece en la API de Checkout; el único «bundle» oficial es de Revenue Recognition (contabilidad) | **No asumir que existe.** Tratar como inferencia y reverificar antes de diseñar sobre ello. |
| **Cupón aplicado por servidor** | Campañas con vigencia, ámbito y límite de usos gobernados por nosotros | El navegador no decide el importe; Stripe calcula `amount_discount`; se puede auditar | Hay que sincronizar la referencia del cupón y ampliar el snapshot | **Recomendado**, con tabla de promociones y `allow_promotion_codes: false`. |
| **Promotion code introducido por el cliente** | Campañas públicas de marketing donde se comparte un código | Experiencia familiar Stripe | El importe depende de la acción del cliente; más riesgo de descuentos no previstos; requiere reconstruir el snapshot | No en esta fase; solo con decisión y diseño específicos. |
| **Price rebajado** para la campaña | Descuentos simples y fijos por producto, sin lógica de códigos | Muy simple; los precios son inmutables y se archiva el anterior | Multiplica Prices; menos trazable qué campaña aplicó; `amount_discount` sería 0 | Alternativa válida si se prefiere simplicidad; decidir caso por caso. |
| Pago **único** (`one_time`) vs recurrente | Nuestro modelo es compra individual | Coincide con el código actual y con las decisiones de producto | — | Mantener `mode=payment` y Prices `one_time`; cualquier suscripción es otra decisión. |

## 7. Decisiones humanas abiertas (no inventar)

- Precios reales de cursos y packs (incluidos los ejemplos numéricos de este
  documento: **no** son propuestas).
- Composición exacta de los packs, si se permite un curso en varios packs y si
  los packs pueden incluir cursos en borrador.
- Vigencia, ámbito y límites de las ofertas; si se permiten códigos públicos.
- Apilamiento: ¿pack + descuento, cupón + Price rebajado, un solo descuento?
- Compra de un pack teniendo ya uno o varios cursos: ¿bloquear, descontar,
  permitir duplicado o dar acceso solo a los nuevos?
- Impuestos, facturación y exigencias legales/fiscales (Stripe Tax queda como
  decisión abierta; nada de esto se activa aquí).
- Política de reembolsos y revocación aplicable a packs y ofertas.
- Activación de Stripe en live, dominio de retorno y endpoint de webhook reales.

## 8. Plan de implementación futura por fases y tests mínimos

Sin código en este documento; solo orden y alcance sugeridos, a revisar.

1. **Fase A — decisión y modelo.** Cerrar la sección 7. Confirmar con Stripe TEST
   que un Price de pack y un cupón se comportan como se espera (sin tocar live).
2. **Fase B — SQL y RLS.** Migraciones versionadas aditivas: tablas de packs,
   promociones y referencias privadas; RPC de oferta/reserva por `offer_kind`;
   fulfillment N; extensión de snapshots. Tests: `npm run test:sql` (PGlite)
   comprobando grants, que `anon`/`authenticated` no lean `private`, inmutabilidad
   del snapshot, unicidad de `order_items` por curso, unicidad de rights,
   rechazo de importes/monedas divergentes y replay idempotente. Después,
   verificación real con Supabase local + `psql`, documentada como pendiente en
   `docs/arquitectura-datos.md`; **nunca** aplicar a remoto sin revisión.
3. **Fase C — Functions.** Adaptar `create-checkout` y `stripe-webhook` con mocks:
   selección de oferta por `offer_id`/`offer_kind`, metadata ampliada,
   `amount_discount` verificado, TTL, sucesor derivado en la RPC y clave de
   idempotencia por pedido (`SHA256(checkout-order:order_id)`), firma, livemode y
   reintentos. Tests de `npm run test:functions`: duplicados de evento,
   importe manipulado, sesión ajena, descuento inesperado, moneda distinta,
   replay tras `already_processed`.
4. **Fase D — Angular.** La interfaz solo elige `offering_id` y `offer_kind`;
   envía el intento opaco y muestra el importe que devuelve el servidor. Sin
   cálculo de precios, sin cupones escritos en el cliente, URL de Checkout
   validada. Tests: validación de entradas, dedupe de llamadas, limpieza de
   marcadores de recuperación y `npm test` / `npm run build`.
5. **Fase E — E2E en TEST y salida a live.** Compra E2E de pack y de oferta con
   webhook real en TEST: N derechos, reintento del mismo evento sin duplicar,
   reembolso/revocación según la política aprobada. Solo tras revisión legal y
   autorización expresa se plantearía live; la verificación en producción sigue
   siendo una decisión pendiente.

## 9. Gates de seguridad

- Secretos y claves de Stripe (incluida la de webhook) **solo** en secretos de
  Edge Functions de Supabase; jamás en el repositorio, el chat, Angular ni filas
  públicas. Los IDs de Price/Cupón del proveedor, en `private`.
- Webhook firmado, con cuerpo crudo, tolerancia acotada y evento registrado por
  ID + hash; acceso concedido únicamente por la RPC transaccional.
- El importe y la moneda cobrados son evidencia del evento firmado y se cotejan
  con el snapshot; la página de éxito no concede nada.
- Sin Stripe live, sin nuevo dominio de retorno y sin impuestos activos sin
  autorización y revisión explícitas.
- Sin correos, nombres ni otros datos personales en metadata, logs ni tablas
  públicas; solo UUID internos opacos.
- No prometer disponibilidad perpetua de los cursos, protección absoluta del
  vídeo ni corrección automática de audio; packs y ofertas no cambian esas
  limitaciones.

## 10. Advertencia

Este documento es **solo una propuesta de diseño**. No está implementado, no se
ha aplicado a ninguna base de datos remota, no activa cobros ni modifica la
configuración actual de checkout/webhook. Requiere revisión humana y decisión
explícita antes de tocar Stripe, las migraciones o la base de datos.
