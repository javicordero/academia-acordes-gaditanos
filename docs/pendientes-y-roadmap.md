# Pendientes y orden de trabajo

Resumen de estado y pendientes. No duplica el detalle de otros documentos: cada
apartado enlaza al que lo desarrolla. No contiene datos personales, claves,
precios ni decisiones que no estén ya acordadas, y no cierra ninguna de las
cuestiones abiertas.

Documentos de referencia: `README.md`, `docs/arquitectura-datos.md`,
`docs/decisiones-producto.md`, `docs/checkout-estado.md`,
`docs/pedidos-checkout.md`, `docs/confirmacion-pago.md`,
`docs/webhook-estado.md`, `docs/legal-y-footer.md`, `docs/referencia-aula.md`.

## 1. Estado funcional actual

### Existe en código local

- Autenticación Supabase (registro, acceso, salida, confirmación y recuperación
  por correo, callback PKCE) y guards de sesión y de admin; el rol admin se lee
  de `public.user_roles`, nunca de metadatos.
- Catálogo público de cursos y ficha de curso que enlaza solo las lecciones que
  devuelve RLS.
- Aula `/aula/:courseSlug/:lessonSlug` con índice de bloques, reproductor
  desacoplado del proveedor, progreso manual y automático al terminar el vídeo
  (`ended` verificado de Bunny Player.js) y vista previa administrativa.
- `/mis-cursos` y perfil propio (`display_name`).
- Materiales PDF privados: bucket `lesson-pdfs`, puente `service_role`,
  listado, preparación, subida firmada, finalización y descarga con URL firmada
  temporal.
- Tipos de lección (`video`, `pdf`, `text`) como `content_type`.
- Comercio **verificado en TEST, sin cobros reales**: oferta de checkout, reserva de pedido con
  snapshot inmutable, recepción de webhook (firma, hash, idempotencia mínima) y
  núcleo SQL de fulfillment `20261117220000_paid_checkout_fulfillment.sql` con
  su prueba `0011`. `enabled` solo en TEST y reversible.

### Desplegado o aplicado en DEVELOPMENT

- Migraciones iniciales del esquema, PDF privado, RPC de lectura de PDF, y
  funciones `lesson-resources` (listado y descarga).
- Contenido de administración y de aulas ya probado por el usuario.
- Compra E2E en Stripe TEST completada: pedido pagado, derecho activo y evento
  procesado (verificado en DEV/TEST, no E2E en producción).
- Bunny configurado y probado en DEV: vídeo de prueba subido y listo, token
  authentication activo y modo sin firma apagado.
- Dudas por lección y reordenación del editor verificadas en DEV.

### No verificado en real

- Runtime Deno de las Edge Functions: no ejecutado en este entorno.
- Concurrencia real: PGlite valida lógica secuencial, no concurrencia ni
  Supabase/Auth/PostgREST reales.
- Despliegue de producción y Stripe live (decisión pendiente).

## 2. Decisiones pendientes del promotor

| id | decisión | por qué bloquea | propuesta por defecto | estado |
| --- | --- | --- | --- | --- |
| D1 | Datos legales del titular (razón social, NIF, domicilio, correo) | Aviso legal, privacidad y cookies no pueden publicarse sin identificarlo | Mantener páginas fuera de producción; nada de datos fiscales en el repo | Pendiente (usuario) |
| D2 | Política de privacidad y cookies definitiva, con inventario real | Banner solo si hay tecnologías no esenciales; sin inventario no hay texto | Sin banner mientras no existan no esenciales | Pendiente (usuario) |
| D3 | Condiciones de contratación, desistimiento en contenido digital, facturación e IVA | Cobrar sin condiciones ni tratamiento fiscal no es viable | No activar cobro hasta validarlas | Pendiente (usuario) |
| D4 | Política de reembolsos y contracargos, y cómo revocar el derecho | La revocación es una operación de servidor; el webhook aún no cubre devoluciones | Revocación manual documentada por soporte antes de automatizar | Pendiente (usuario) |
| D5 | Redacción de condiciones de retirada/cierre de curso | El acceso ya es sin caducidad, pero revocable; faltan reglas escritas de retirada y comunicación | Redactar junto a D3 y no prometer perpetuidad | Pendiente (usuario) |
| D6 | Derechos de letras, melodías, grabaciones y arreglos de las coplas | El ejemplo muestra contenido propio; el resto depende del promotor | Solo usar contenido propio con autorización documentada | Pendiente (usuario) |
| D7 | Precios de lanzamiento y packs o cupones | Hoy no hay precios reales, solo hipótesis; el servidor los calcula | Precio único por curso en `course_prices`; packs/cupones después | Pendiente (usuario) |
| D8 | Foro y dudas: visibilidad pública o solo compradores, moderación y quién, fase | Dudas por lección implementadas y verificadas en DEV; el foro completo sigue en fase posterior y su modelo es decisión pendiente | Lección comprada, inicio de la fase de comunidad | Pendiente (usuario) |
| D9 | Dominio `academia.acordesgaditanos.com`: DNS | El frontend es CSR estático; el hosting y el DNS no están hechos | Hosting estático + DNS final; sin tocar nada hasta decisión | Pendiente (usuario) |
| D10 | Stripe: cuenta en modo test, más tarde live; país fiscal, moneda, métodos de pago | Stripe Checkout verificado en TEST con `enabled` solo en TEST y reversible; Stripe live y fiscalidad son decisión pendiente | Cuenta modo test con el promotor | Pendiente (usuario) |
| D11 | Bunny: confirmar región, qué vídeos subir y quién posee los derechos | Bunny configurado y token authentication activo en DEV; región, vídeos y derechos siguen pendientes (decisión pendiente) | Biblioteca de desarrollo y `COLGAOS.mp4` como primer vídeo, contenido propio | Pendiente (usuario) |
| D12 | Aprobar la reparación del historial de migraciones CLI (`supabase migration repair`) | Migraciones aplicadas por editor SQL no aparecen en el historial CLI; cualquier `db push` automático sin conciliar es riesgo | Reparación manual y autorizada antes de cualquier `db push` | Pendiente (usuario) |
| D13 | Nombre, foto, bio, credenciales y testimonios reales del profesor para la portada | La portada no se construye sin datos reales; no se inventan | Ninguno: se esperan datos textuales y de imagen del usuario | Pendiente (usuario) |
| D14 | Alcance de lanzamiento de subtítulos, capítulos y bucle A–B | Depende de capacidades reales de Bunny que no se han verificado | Fuera de lanzamiento inicial; evaluar después | Pendiente (usuario) |
| D15 | Duración de vídeo: metadatos del proveedor o dato editorial manual | La duración no se captura automáticamente; depende del proveedor | Duración manual (dato editorial separado) hasta la integración de Bunny | Pendiente (usuario) |
| D16 | Copia de seguridad externa de PostgreSQL y restauración probada antes de cobrar | Riesgo de pérdida si se cobra sin respaldo probado | Concretar y probar antes de activar cobros con usuarios reales | Pendiente (usuario) |

Nota (2026-11-19): el progreso es manual y también automático al recibir el
`ended` verificado de Bunny Player.js (decisión del promotor, ver
`docs/decisiones-producto.md`). El evento no prueba atención real ni sustituye
al botón manual; no hay autoplay ni promesa de DRM. Sin contrato verificable no
se marca nada.

Nota (2026-11-18): existen plantillas orientativas en `/legal/` y sus enlaces
en el pie de página, marcadas como «Plantilla orientativa: revisar antes de
publicación». No resuelven D1–D5: datos del titular, textos definitivos,
inventario de cookies, condiciones fiscales, reembolsos y retirada siguen
pendientes de revisión profesional. No activan analítica ni conceden derechos.

## 3. Dudas técnicas abiertas

- Presupuesto Angular: el build de producción supera en ~13 kB el máximo de
  500 kB del presupuesto inicial (versión observada 2026-11-17). Se puede
  ajustar el límite, dividir más o aceptar el aviso, pero no se ha decidido.
- `npm audit` informa 12 vulnerabilidades altas en desarrollo (entre ellas
  `picomatch`); no todas tienen parche compatible sin cambio semver mayor.
  Afectan a herramientas de desarrollo, no al bundle servido.
- Runtime Deno no instalado: los tests de las Edge Functions se ejecutan en Node
  con mocks (`npm run test:functions`) y no prueban el runtime real.
- PGlite (`npm run test:sql`) no prueba concurrencia entre conexiones ni
  Supabase/Auth/PostgREST/Storage reales.
- Imágenes y capturas de pantalla del curso/del aula: pendientes.
- Página de inicio con presentación del profesor: pendiente, sin datos ni diseño
  cerrados.
- Tipos de lección degradados en datos antiguos: las lecciones creadas antes
  de `content_type` toman el valor por defecto `video` y no se corrigieron
  retroactivamente.

## 4. Orden de trabajo funcional restante

1. Cerrar el SQL de fulfillment y su revisión: **hecho y verificado en DEV/TEST**
   (migración `..._paid_checkout_fulfillment` y prueba `0011`).
2. Integrar el fulfillment en el handler del webhook con firma, verificación e
   idempotencia: **hecho y verificado en TEST**; `enabled` solo en TEST y
   reversible.
3. Bunny Stream:
   1. metadatos privados (`private.lesson_videos`) y SQL de lectura de servidor: **hecho**,
   2. Edge Function de token firmado tras comprobar sesión y derecho o admin: **hecho y verificado en DEV**,
   3. adaptador Angular desacoplado, provider registrado y flag público activado en DEV: **hecho**,
   4. UI de administración para vincular y subir vídeo: **hecho y verificado en DEV**,
   5. pruebas con mocks y con Bunny real en DEV: **hechas**; queda la
      comprobación en producción.
4. Vídeo de prueba subido y listo en Bunny (verificado en DEV); el vídeo
   definitivo sigue sujeto a decisión pendiente.
5. Compra E2E en Stripe TEST: **hecha y verificada en DEV/TEST**; no E2E en
   producción y Stripe live es decisión pendiente.
6. Páginas legales: plantillas orientativas ya implementadas en `/legal/`
   (aviso, privacidad, cookies, términos y reembolsos) y enlazadas en el pie;
   pendientes de datos reales y revisión profesional. Consentimiento y banner
   solo si procede (fuera de este alcance).
7. Conciliación del historial de migraciones CLI (D12), después las páginas legales.
8. Fase final de estilos y layout, según los requisitos ya aprobados.
9. Foro completo, al final; las dudas por lección ya están implementadas
   (verificado en DEV).

## 5. Fase final de estilos (aplazada, requisitos ya aprobados)

No implementar ahora. Requisitos registrados en `AGENTS.md` y
`docs/decisiones-producto.md`:

- Barra de acciones **arriba** del vídeo: flechas anterior/siguiente y botón de
  completar manual.
- Índice **lateral izquierdo** por bloques, lecciones ordenadas y la activa
  resaltada.
- En móvil, menú **hamburguesa** que se despliega **desde la izquierda**.
- **Vídeo central** de la lección; debajo, título, contenido de la lección,
  materiales y conversación de dudas por lección (ya implementada en DEV; el
  foro completo, más adelante).
- Estética de **identidad propia**: no copiar marca, tipografías ni assets de
  terceros.
- La accesibilidad y el responsive se mantienen: teclado, foco visible,
  etiquetas, contraste y `lang="es"`.

## 6. Reglas de seguridad que no cambian

- Sin secretos en el repositorio, el chat o la configuración local compilada.
- En cliente, solo la URL y la publishable key públicas de Supabase.
- `service_role`, las claves de Stripe y los secretos de Bunny (Library API key
  y signing key) viven solo en servidor, como secretos de Edge Functions
  configurados a mano.
- RLS es la barrera real; el rol admin no se autoasigna y la ruta de Angular no
  protege nada por sí sola.
- El acceso se concede por webhook firmado, verificado e idempotente; la página
  de éxito no concede acceso.
- PDFs y vídeos de pago son privados y se sirven con URL o token firmado después
  de comprobar el derecho.
- Sin DRM ni promesas de protección absoluta: un enlace puede compartirse hasta
  caducar y no impide la grabación de pantalla.
- No se copia contenido ni branding de terceros; las fuentes de autoría son las
  aprobadas por el promotor.

## Riesgos técnicos detectados en auditoría (2026-11-19)

Segunda pasada de auditoría: hallazgos técnicos, no decisiones de producto.

- **Stripe:** webhook firmado e idempotente, OK; reembolsos y contracargos **no implementados** (D4). La IP allowlist no aplica a la verificación de firma en Edge Functions. No activar Stripe live sin revisión.
- **Supabase:** `service_role` solo en servidor, OK; las claves `anon`/`service_role` quedan deprecadas a finales de 2026, así que planificar la migración a `sb_publishable_`/`sb_secret_` o al patrón servidor. Historial de migraciones CLI no reconciliado (sin CLI, configuración ni token locales): no ejecutar `db push` hasta `migration list`/`repair`.
- **Bunny:** token de embed con SHA256 y expiración; el token auth protege solo el embed, **no** HLS, miniaturas ni MP4 directos; no es DRM. TUS con firma en servidor. No contratar extras sin permiso.
- **GA4:** si la academia se sirve desde un subdominio, compartir propiedad y flujo con consentimiento; hoy hay `ga-disable`, cookie de preferencias y Consent Mode v2 con finalidades publicitarias denegadas, pero sin ID real ni E2E; vigilar self-referrals si se configura mal.
- **Angular/WCAG:** rutas lazy y ARIA revisados; foco en `NavigationEnd` pendiente de verificación puntual.

Estos hallazgos no abren ni cierran decisiones humanas: D4, D7, D9, D13, D16 y Stripe live siguen abiertas. No se fijan plazos ni costes nuevos.
