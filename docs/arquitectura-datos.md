# Arquitectura de datos y permisos

Documento técnico público del modelo inicial de la academia. No contiene datos
personales, precios reales, claves ni el plan privado. El repositorio hermano del
cancionero no se modifica.

## Estado

- Recursos PDF: aplicada manualmente en desarrollo el 17 de noviembre de 2026
  `20261117130000_private_pdf_storage.sql`. Prevé el bucket privado
  `lesson-pdfs`, con máximo orientativo de 10 MiB por objeto y MIME
  `application/pdf`, y una política restrictiva que deniega acceso directo a
  `anon` y `authenticated` incluso ante políticas permisivas amplias. El
  catálogo remoto confirmó la configuración y la política restrictiva.
- Listado y descarga PDF están desplegados en desarrollo, sin pruebas E2E reales,
  desde `supabase/functions/lesson-resources`. No están desplegadas la subida,
  finalización ni su interfaz. La migración aplicada manualmente
  `20261117140000_lesson_pdf_read_rpc.sql` añade un puente invocable solo por
  `service_role`: el esquema `private` sigue sin exponerse. La función usa
  `getUser(jwt)` y pasa el ID verificado al puente, que comprueba publicación y
  rol admin en base de datos o derecho activo para el curso antes de leer
  metadatos. `private.lesson_resources` ya contiene UUID, lección, título,
  tipo, bucket, ruta, descarga y posición; no tiene borrado lógico.
  Solo se devuelven PDF descargables con bucket y ruta canónicos.
  Una muestra no concede acceso gratuito a sus recursos automáticamente.
  El diseño previsto usa rutas sin datos personales
  `course-uuid/lesson-uuid/resource-uuid/file.pdf`; una URL firmada puede
  contener la ruta y es compartible hasta su caducidad, por lo que no es un
  secreto permanente ni protección absoluta.
- Contrato: POST JSON con `operation: "list"` y `lessonId`, o
  `operation: "download"`, `lessonId` y `resourceId` UUID. Lista devuelve solo
  `id`, `title`, `kind`; descarga devuelve `downloadUrl` firmada como adjunto
  por 60 segundos (UUID en minúsculas obligatorios). El puente entrega
  internamente el UUID del curso y el handler comprueba que coincida con el
  primer segmento de la ruta; no lo añade al DTO. El objeto firmado no comprueba
  que el archivo exista; una URL
  emitida sigue usable hasta caducar incluso tras revocación. No se comprueba
  físicamente su contenido MIME. CORS admite por defecto solo
  `http://localhost:4200`; `LESSON_RESOURCES_ALLOWED_ORIGINS` permite fijar
  orígenes exactos separados por comas en servidor tras revisión.
- Runtime requiere `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en servidor.
  En esta función de desarrollo `verify_jwt` está desactivado en el gateway
  porque este verifica solo JWT con el secreto heredado; el handler exige y
  verifica el JWT mediante `Auth.getUser` antes de consultar el puente. La clave
  publishable va en `apikey` y el JWT de sesión en `Authorization`. En la nube se
  comprobaron POST sin token y token inválido (401), GET (405), origen ajeno
  (403) y OPTIONS desde localhost:4200 (204). Siguen pendientes Auth con sesión
  válida, PostgREST, RLS, firmas y descarga real. Referencia:
  https://supabase.com/docs/guides/functions/auth-headers
- `npm run test:functions` ejecuta Vitest en Node con mocks, separado de
  `npm test` de Angular. `npm run test:sql` usa PGlite simulado. Ninguno valida
  Deno ni Auth, PostgREST o Storage reales. El despliegue fue aceptado por el
  panel y las respuestas negativas anteriores ejecutaron el handler; no se ha
  ejecutado una comprobación de tipos Deno independiente.
- Storage Free tiene una cuota orientativa de 1 GB por proyecto; verificar
  límites y consumo vigentes antes de activar. No se autoriza coste de pago.
  Faltan límites de frecuencia, seguimiento de cuota, limpieza de objetos
  huérfanos y política de recuperación. No hay rate limiting implementado.
- Las dos migraciones PDF se aplicaron una vez mediante editor SQL, con SHA-256
  del contenido del editor contrastado con el archivo local:
  `20261117130000`: `aa9fdc310cb417289fe4e5c53ec75d233af126c0b7f9b74138764c491fe98d69`;
  `20261117140000`: `7be8045948c9792243d00330568a4f766eda41589c7fef7e17243ef17b987576`.
  La RPC concede EXECUTE a `service_role`, no a PUBLIC, anon ni authenticated.
  El historial CLI no refleja las migraciones manuales, incluida la inicial:
  no ejecutar `db push` hasta conciliarlo mediante el procedimiento oficial.
- Esquema inicial versionado en `supabase/migrations/20261117120000_initial_academy.sql`.
  El encabezado del archivo describe el estado cuando se escribió; no se ha
  vuelto a tocar después de su aplicación autorizada para conservar el mismo
  contenido (y SHA) que se pegó en el editor SQL. El estado remoto actual se
  describe en este documento, no en ese comentario histórico.
- Pruebas de RLS en `supabase/tests/0001_academy_rls.psql`.
- Runner portable de la suite: `scripts/test-sql.mjs` (`npm run test:sql`).
- La migración se ha aplicado una sola vez, con autorización explícita del
  usuario, al proyecto Supabase de desarrollo `academia-acordes-gaditanos-dev`
  mediante el editor SQL del panel. No se creó ningún proyecto nuevo, no se
  cargaron datos semilla ni se activaron pagos o vídeo. La comprobación inicial
  remota fue por consultas al catálogo (tablas, RLS,
  políticas, grants y funciones), no con la suite de pruebas.
- La migración se ha ejecutado y la suite se ha pasado en PostgreSQL 17 local con
  un sustituto mínimo de `auth.uid()` y de los roles de Supabase. Esa prueba
  valida la lógica SQL/RLS, **no** sustituye a una ejecución con el stack local de
  Supabase ni a una revisión de seguridad en producción.
- La misma suite se puede repetir sin Docker ni `psql` con `npm run test:sql`
  (PGlite en memoria, mismo límite: solo lógica SQL/RLS). La ejecución contra
  Supabase local con Docker, CLI y `psql` queda como verificación posterior, no
  realizada.

## Autenticación de la aplicación (estado real)

- El cliente Angular usa `@supabase/supabase-js` 2.119.0. La URL y la
  publishable key se leen de `src/environments/environment.local.ts`, copia
  ignorada de la plantilla `environment.local.example.ts` creada por
  `npm run config:init`. No hay `.env` ni secretos en el navegador; sin esos
  valores la interfaz muestra que la autenticación está pendiente de
  configuración y no simula cuentas.
- Flujo PKCE: `flowType: 'pkce'` y `detectSessionInUrl: false`. `/auth/callback`
  admite tanto `code` (mediante `exchangeCodeForSession`) como `token_hash` con
  su tipo OT (mediante `verifyOtp`), según entregue la plantilla de correo. El
  enlace se retira de la barra de direcciones y no se registra en logs. El
  destino de recuperación es
  `/auth/actualizar-contrasena` y el de confirmación
  `/auth/cuenta-confirmada`. Los `returnUrl` se limitan a rutas internas.
- El servicio de sesión mantiene sesión, estado de inicialización y errores en
  signals. Los guards esperan la restauración de sesión; el guard de `/admin`
  espera además la consulta de rol. El callback de `onAuthStateChange` solo
  actualiza ese estado ligero: la consulta a `user_roles` se programa con
  `setTimeout(0)` fuera del callback, se cancela al cambiar de sesión o al
  destruir el servicio y una respuesta obsoleta nunca sobrescribe el rol actual.
- El rol admin se determina con un `select` de la propia fila en
  `public.user_roles` (`user_id = auth.uid()` y `role = 'admin'`), nunca con
  `user_metadata` ni `app_metadata`. Esa comprobación de la interfaz no sustituye
  a RLS: una sesión sin rol recibe un 404/denegación en la API según la tabla.
- El trigger `private.handle_new_user()` inserta solo `public.profiles(id)`; no
  copia correos ni metadatos y no concede roles. Por eso el registro no solicita
  nombre visible: `display_name` se podrá actualizar por el propio usuario
  cuando exista esa pantalla, con la política `profiles_update_own`.
- No se ha creado ningún usuario admin ni insertado ninguna fila en
  `public.user_roles` en este bloque. El aprovisionamiento admin debe hacerlo
  desde servidor una persona autorizada, cuando se decida.
- Se han probado registro, confirmación, acceso y panel de cursos con una cuenta
  real. Las pruebas unitarias usan mocks del SDK y no demuestran la integración
  remota de la nueva estructura. Los límites de envío pueden afectar al correo.

## Aula (estado real)

- El reproductor de prueba usa un contrato inyectable y configuración local
  ignorada, solo en desarrollo. No almacena IDs en `public.lessons`. YouTube
  es externo y compartible, no protege el pago; no se carga antes de pulsar.
  La futura fuente privada requiere autorización y firma en servidor.
- Ruta lazy `/aula/:courseSlug/:lessonSlug`, sin guard global de sesión. La
  lección de muestra se abre sin sesión; el resto depende de lo que RLS devuelva.
  La ruta de Angular no garantiza compra ni acceso: la barrera es RLS.
- La ficha pública del curso (`/cursos/:slug`) solo enlaza las lecciones que
  devuelve RLS para ese curso (publicadas y de muestra, con derecho activo o
  visibles para admin), con el `slug` del curso y el `slug` de la lección.
  `slug` es una columna pública de `public.lessons`, ya seleccionable bajo la
  política de lectura; no se exponen columnas de `private`, precios ni metadatos
  de vídeo.
- La carga del aula y del catálogo se ha probado solo con mocks del SDK en Vitest
  y con la lógica SQL/RLS en PGlite. No se ha comprobado con Auth, PostgREST ni
  RLS reales de Supabase; las pruebas no usan derechos ni roles reales.

## Comentarios por lección (backend mínimo)

La migración `20261118160000_lesson_comments.sql` y la prueba
`supabase/tests/0019_lesson_comments.psql` añaden el backend mínimo de
comentarios por lección. La ampliación aditiva
`20261118170000_lesson_comments_nested_replies.sql` y la prueba
`supabase/tests/0022_lesson_comments_nested.psql` permiten responder también a
una respuesta. La migración aplicada en DEV no se editó; 0019 se actualizó al
nuevo contrato y sigue cubriendo los rechazos reales, mientras 0022 añade
profundidad ≥ 3 e ida y vuelta admin ↔ alumno.
No es el foro completo ni sustituye al servicio único de conversación
pendiente; este bloque no incluye interfaz Angular.

| Objeto | Función |
| --- | --- |
| `public.lesson_comments` | `id`, `lesson_id`, `author_id`, `parent_id`, `body` (1..2000 tras `btrim`) y `created_at`. Borrado en cascada con lección, autor y padre. |
| `public.list_lesson_comments(p_lesson_id uuid)` | Devuelve `id`, `parent_id`, `body`, `created_at`, `author_display_name` y `author_is_admin`, ordenados por `created_at ASC, id ASC`. |
| `public.create_lesson_comment(p_lesson_id uuid, p_body text, p_parent_id uuid default null)` | Inserta y devuelve la misma forma. El padre, si se indica, debe existir en la MISMA lección y no ser el propio comentario; puede ser raíz o una respuesta. Sin acceso devuelve 0 filas. |

La tabla tiene RLS activo **sin políticas** y sin grants para `anon` ni
`authenticated`; `service_role` conserva todos. Las dos RPC son
`security definer`, con `set search_path = ''`, y solo `authenticated` recibe
`EXECUTE` (sin PUBLIC, anon ni service_role). Comprueban `auth.uid()` en
servidor y exigen admin real en `public.user_roles` o lección publicada de
curso publicado con muestra gratuita o derecho activo (`revoked_at is null`).
El admin también ve y escribe en borradores. `anon` queda denegado por GRANT;
una sesión sin derecho, sin claim o con derecho revocado obtiene 0 filas sin
revelar el motivo ni si la lección existe. `author_is_admin` se calcula en BD
desde `user_roles`; el nombre visible se normaliza en servidor con
`public.safe_display_name`: admin real desde `user_roles` ⇒ `'Administrador'`;
otros nombres con `'@'` o equivalentes a admin ⇒ `'Alumno'`; nunca el correo.

Decisiones de alcance: se requiere sesión (la muestra gratuita es
autenticada); **hilos anidados sin límite de profundidad en BD; sangrado visual
acotado en UI** (decisión de presentación, no implementada en este backend):
`parent_id` puede apuntar a la raíz o a cualquier respuesta existente de la
misma lección, nunca a un comentario de otra lección ni a sí mismo; cuerpo
recortado de 1 a 2000 caracteres. No hay edición, borrado, moderación,
notificaciones, tiempo real ni contadores. No se publican cursos ni lecciones y
las RPC no crean derechos, pedidos ni progreso. Las migraciones **no se han
aplicado a ningún proyecto remoto**: la verificación fue `npm run test:sql`
(PGlite), que valida lógica SQL/RLS, **no** Auth, PostgREST ni RLS reales de
Supabase. Este agente no ha desplegado ni aplicado nada a remoto.

## Foro general (backend de conversación)

La migración `20261118180000_forum_conversation.sql` y la prueba
`supabase/tests/0023_forum_conversation.psql` añaden el backend del foro general
con tablas propias: no editan ni regresan el backend mínimo de comentarios por
lección descrito arriba. Es una sola capa de conversación para la futura UI;
este bloque no incluye interfaz Angular, subidas ni moderación.

| Objeto | Función |
| --- | --- |
| `public.forum_categories` | `id`, `slug` único, `title`, `description`, `position` y `created_at`. Semilla idempotente por slug: `general`, `dudas` y `presentaciones`. |
| `public.forum_threads` | `id`, `category_id`, `author_id`, `title` (1..120 tras `btrim`) y `created_at`; borrado en cascada. |
| `public.forum_posts` | `id`, `thread_id`, `author_id`, `parent_id`, `body` (1..2000 tras `btrim`) y `created_at`; borrado en cascada. Respuestas anidadas del mismo hilo, sin límite de profundidad en BD. |
| `public.list_forum_categories()` | Devuelve `id`, `slug`, `title`, `description` y `position`, ordenados por `position`, `id`. |
| `public.list_forum_threads(p_category_id uuid)` | Devuelve hilos ordenados por `created_at DESC, id DESC`, con `author_display_name`, `author_is_admin` y `reply_count` = posts del hilo − 1 (raíz), nunca negativo. |
| `public.create_forum_thread(p_category_id uuid, p_title text, p_body text)` | Inserta hilo y post raíz en una transacción; devuelve el cuerpo y el autor del post raíz unido por `thread_id`. |
| `public.list_thread_posts(p_thread_id uuid)` | Misma forma que `list_lesson_comments`, ordenada por `created_at ASC, id ASC`. |
| `public.create_thread_post(p_thread_id uuid, p_body text, p_parent_id uuid default null)` | Inserta y devuelve la misma forma; el padre, si se indica, debe existir en el MISMO hilo y no ser el id generado. |

Las tres tablas tienen RLS activo **sin políticas** y sin grants para `anon` ni
`authenticated`; `service_role` conserva todos. Las cinco RPC son
`security definer`, con `set search_path = ''` y nombre totalmente cualificado;
solo `authenticated` recibe `EXECUTE` y `anon` queda denegado por GRANT.
Comprueban `auth.uid()` en servidor: cualquier `authenticated` con sesión lee y
escribe en el foro general, sin exigir `entitlement` ni asociar curso. Sin sesión
o con hilo/categoría inexistente devuelven 0 filas sin revelar el motivo; título
y cuerpo se validan con `btrim` antes de insertar. Nombre visible normalizado
en servidor; admin se identifica desde `user_roles`, no desde `display_name`.
Un admin real se muestra como `Administrador`; los demás nombres con `'@'` o
equivalentes a admin se muestran como `Alumno`, nunca el correo. No hay edición, borrado, moderación, notificaciones, realtime ni
contadores persistentes, y las RPC no crean pedidos, derechos, progreso ni roles.

La verificación fue `npm run test:sql` (PGlite), que valida solo lógica SQL/RLS,
**no** Auth, PostgREST ni RLS reales de Supabase. La migración **no se ha
aplicado a ningún proyecto remoto** ni desplegado; este agente no ha tocado
migraciones ya aplicadas en DEV.

## Moderación (borrado real, backend)

La migración aditiva `20261118233000_comment_moderation.sql` y la prueba
`supabase/tests/0027_comment_moderation.psql` añaden dos RPC de borrado sobre las
tablas ya existentes, sin editar migraciones aplicadas ni tocar la UI:

| RPC | Comportamiento |
| --- | --- |
| `public.delete_lesson_comment(p_comment_id uuid) returns boolean` | Borra el comentario y sus respuestas en cascada (FK `parent_id ... on delete cascade`). Devuelve `true` solo si borró algo. |
| `public.delete_forum_post(p_post_id uuid) returns jsonb` | Si es respuesta, borra ese post y sus descendientes (`deleted=true, thread_deleted=false, deleted_posts=n`). Si es la raíz, borra el hilo completo por cascada (`deleted=true, thread_deleted=true, deleted_posts=n`). |

Ambas son `security definer` con `set search_path = ''` y todo cualificado.
Exigen sesión (`auth.uid()` no nulo) y un rol admin **real** en
`public.user_roles`; no hay parámetro de actor. Sin sesión, sin ese rol o con un
id inexistente devuelven `false` / `deleted=false` con la misma forma, sin
revelar si el objeto existe. Solo `authenticated` recibe `EXECUTE` (no PUBLIC,
anon ni service_role); las tablas siguen con RLS sin políticas y sin grants de
cliente. No se borran categorías, roles, derechos, pedidos ni progreso, y no se
exponen correos, autores, GUID de Bunny ni rutas. Los alumnos no pueden editar
ni borrar; no hay flags de moderación, notificaciones ni moderación avanzada
todavía. La verificación es `npm run test:sql` (PGlite): valida lógica SQL/RLS,
**no** Auth, PostgREST ni RLS reales de Supabase. La migración **no se ha
aplicado a ningún proyecto remoto** ni desplegado.

## Principios

1. **La base de datos decide.** Angular puede ocultar botones, pero la
   autorización real está en RLS y en el servidor. Ocultar una ruta no protege
   nada.
2. **Tres roles de base de datos:** `anon` (visitante), `authenticated` (cuenta
   con sesión) y `service_role` (solo servidor). Un administrador es una cuenta
   `authenticated` con una fila en `public.user_roles`; no es un rol de
   PostgreSQL distinto.
3. **El rol admin no se autoasigna.** `public.user_roles` no tiene permisos de
   escritura para clientes. Solo `service_role` puede conceder o retirar admin.
   No hay columna de rol en `profiles`.
4. **Esquema `private` no expuesto.** La API pública de Supabase expone
   `public`; `private` guarda identificadores de vídeo, rutas de recursos,
   precios de proveedor, datos personales y eventos de comercio. Ni `anon` ni
   `authenticated` tienen `SELECT` sobre esas tablas.
5. **Sin caducidad programada de derechos.** La compra es individual por curso,
   no hay suscripción y `entitlements` no tiene fecha de expiración. Un derecho
   puede revocarse explícitamente desde servidor (por ejemplo, reembolso o
   contracargo, según la política que se apruebe). Esto no promete disponibilidad
   perpetua del servicio ni del contenido.
6. **Nada de claves en el cliente.** Las claves de Bunny, Stripe o `service_role`
   viven solo en servidor. Los IDs de vídeo y las rutas de archivos no se
   publican en tablas legibles por el navegador.

## Relaciones principales

```text
auth.users 1 ── 1 public.profiles
auth.users 1 ── 1 private.profile_private
auth.users 1 ── N public.user_roles        (rol admin, escritura solo servidor)

public.courses 1 ── N public.course_sections 1 ── N public.lessons
public.courses 1 ── N public.course_prices
public.lessons 1 ── 1 private.lesson_videos
public.lessons 1 ── N private.lesson_resources

public.orders 1 ── N public.order_items
public.order_items N ── 1 public.courses
public.orders 1 ── N public.entitlements
public.entitlements N ── 1 public.courses
public.entitlements N ── 1 auth.users

auth.users 1 ── N public.lesson_progress N ── 1 public.lessons
private.course_price_refs N ── 1 public.course_prices
private.commerce_events                     (idempotencia de webhooks)
```

`lessons` guarda `course_id` y `section_id` con una clave foránea compuesta que
impide que una lección quede en un bloque de otro curso. El orden editorial se
expresa con `position` en bloques y lecciones.

La migración `20261117180000_lesson_content_type.sql` añade `content_type`
(`video`, `pdf` o `text`, por defecto `video`). Es un modelo editorial
provisional: no asigna un documento principal ni cambia la autorización.
Los documentos siguen en recursos privados y se consultan mediante el flujo
existente. Aplicar la migración en cada entorno antes de desplegar este cliente.

## Tablas

| Tabla | Para qué | Datos sensibles |
| --- | --- | --- |
| `public.profiles` | Perfil público mínimo: `display_name`. | No. |
| `private.profile_private` | Nombre legal y futuros datos personales. | Sí, solo servidor. |
| `public.user_roles` | Rol `admin` de plataforma. | No, pero escritura solo servidor. |
| `public.courses` | Curso, nivel, estado (`draft`/`published`/`archived`) y orden. | No. |
| `public.course_sections` | Bloques/módulos del curso y su orden. | No. |
| `public.lessons` | Lección, contenido público, orden, publicación y marca de muestra gratuita. | No. |
| `public.course_prices` | Importe y moneda de catálogo; solo lectura pública de precios activos. | Importe público; escritura solo servidor. |
| `private.course_price_refs` | IDs de precio del proveedor (Stripe). | Sí, solo servidor. |
| `public.orders` | Pedido, estado, importes y snapshots. | Financiero; lectura propia, escritura solo servidor. |
| `public.order_items` | Líneas con título e importe congelados. | Financiero; lectura propia. |
| `public.entitlements` | Derecho de acceso por usuario y curso, revocable. | Acceso; lectura propia, escritura solo servidor. |
| `public.lesson_progress` | Progreso manual del alumno. | Solo el propio usuario. |
| `public.lesson_comments` | Comentarios por lección, con hilos anidados (sin límite de profundidad en BD); acceso solo por RPC. | Nombre visible sin correo; RLS sin políticas y sin grants de cliente. |
| `private.lesson_videos` | ID de Bunny, duración y estado del vídeo. | Sí, solo servidor. |
| `private.lesson_resources` | Bucket y ruta de PDFs, tablaturas, audios, etc. | Sí, solo servidor. |
| `private.commerce_events` | ID externo de webhook y estado de procesamiento. | Sí, solo servidor. |

## Matriz de permisos

Leyenda: **Sí** = permitido; **Propio** = solo filas del usuario actual; **—** =
denegado; **Admin** = permitido si `private.is_admin()`.

| Recurso | Visitante | Alumno sin compra | Alumno con derecho | Admin | `service_role` |
| --- | --- | --- | --- | --- | --- |
| Cursos publicados | Sí | Sí | Sí | Sí | Sí |
| Cursos en borrador | — | — | — | Sí | Sí |
| Bloques de curso publicado | Sí | Sí | Sí | Sí | Sí |
| Lección de muestra publicada | Sí | Sí | Sí | Sí | Sí |
| Lección no muestra | — | — | Sí, si el derecho está activo | Sí, sin compra | Sí |
| Precio activo de curso publicado | Sí | Sí | Sí | Sí | Sí |
| Precio inactivo o histórico | — | — | — | Sí | Sí |
| Perfil público mínimo | — | Propio | Propio | Todos | Todos |
| Datos personales privados | — | — | — | — | Sí |
| Rol propio | — | Propio | Propio | Propio | Todos |
| Escribir rol admin | — | — | — | — | Sí |
| Pedido / líneas | — | Propio | Propio | — | Sí |
| Derecho de acceso | — | Propio | Propio | — | Sí |
| Progreso propio | — | — | Lectura y escritura | — | Sí |
| Comentarios de lección vía RPC | — | Muestra, sí | Sí | Sí | — |
| `public.lesson_comments` (tabla) | — | — | — | — | Sí |
| Vídeo / rutas de recursos | — | — | — | — | Sí |
| Crear/editar/borrar catálogo | — | — | — | Sí | Sí |
| Eventos de comercio | — | — | — | — | Sí |

Notas:

- **Admin no equivale a acceso a finanzas.** `orders`, `order_items` y
  `entitlements` no tienen política de administración en la API pública; se
  gestionan desde servidor. En esas tres tablas, una cuenta admin es **solo
  propia, sin privilegio admin**: lee sus propias filas por RLS de usuario
  (columna «Admin» = `—`) y no recibe ningún grant adicional de tabla o columna.
  Un admin **sí** ve cursos, bloques, lecciones y perfiles públicos mínimos, pero
  tampoco los datos privados de `private` (vídeos, recursos, precios de
  proveedor ni eventos de comercio). Las pruebas comprueban los grants con
  `has_table_privilege`; si el producto necesita acceso financiero de admin, se
  hará desde servidor con su propio control, no ampliando estos grants.
- **`private` no se lee desde el cliente.** `anon` y `authenticated` —también un
  admin— quedan sin `SELECT` sobre `private.commerce_events`,
  `private.course_price_refs` y `private.profile_private`; las pruebas lo
  verifican por denegación de privilegio, no por filtrado de filas.
- **Una lección de muestra no genera progreso; el rol admin tampoco.** Se puede
  ver sin compra (y el admin ve también borradores), pero `lesson_progress`
  exige un derecho vigente según `private.can_track_lesson_progress`: ni la
  marca de muestra ni el rol admin bastan por sí solos, como confirman la SQL y
  sus pruebas. Si el producto quiere registrar progreso en muestras, es una
  decisión posterior.
- **Borrado del propio progreso:** el alumno puede borrar sus filas aunque el
  derecho se haya revocado; es un dato propio y no revela contenido del curso.
- **Derecho revocado:** deja de conceder acceso de inmediato. La fila se conserva
  con `revoked_at` y `revocation_reason` para trazabilidad.
- **Un derecho activo por usuario y curso.** Un índice único parcial lo impide;
  el histórico de derechos revocados se conserva.

## Panel de administración

La ruta lazy protegida permite gestionar cursos, bloques y lecciones mediante
RLS. Los nuevos elementos se añaden al final y no se ofrece borrado destructivo.
La reordenación usa las RPC atómicas `reorder_course_sections` y
`reorder_section_lessons` de la migración `20261118150000`: comprueban el rol
admin en `public.user_roles`, exigen la lista completa del mismo padre y
reasignan posiciones contiguas 0..n-1 con bloqueo consultivo y desplazamiento
temporal, respetando los `unique`. La interfaz ofrece arrastrar y soltar
(HTML5) con botones «Subir»/«Bajar» como alternativa de teclado; la RPC se
invoca con el UID verificado por Auth y también es invocable por `service_role`.
La migración y sus pruebas se han verificado con PGlite, no en Supabase real,
y no se han aplicado a ningún proyecto remoto. Las lecciones tienen estado de publicación;
los bloques de cursos publicados son visibles. El contenido Markdown se guarda
como texto. La estructura solo se ha probado con mocks, no en PostgREST real.
No hay gestión de precios ni subidas.

Alcance previsto:

- Ruta Angular `/admin` con carga diferida (lazy), separada del aula.
- Reordenación editorial de bloques y lecciones: disponible mediante las RPC
  atómicas anteriores, con drag & drop y botones de teclado en el panel.
- Vista previa de borradores antes de publicar. Los borradores no son públicos.
- Metadatos de vídeo (ID de Bunny, duración, estado) y documentos anexos.
- Respuestas a preguntas de alumnos, **unificadas con el foro** cuando se
  implemente. El backend mínimo de comentarios por lección descrito arriba es
  la base de ese servicio único; no se crea un sistema paralelo.
- Una sola versión inicial con rol `admin`. No se inventan permisos operativos de
  instructor, moderador ni profesor; se añadirán cuando se definan.

Cómo encaja con la seguridad:

- El CRUD de `courses`, `course_sections` y `lessons` se hace contra la API con
  RLS de admin. No requiere `service_role` en el navegador.
- Los metadatos de vídeo y recursos, la subida a Bunny y la firma de URLs se
  harán mediante Edge Functions u otro backend con `service_role`, comprobando
  primero el rol admin. Las credenciales de Bunny y Stripe no salen del servidor.
- Los archivos serán privados. El alumno recibirá una URL firmada temporal solo
  tras comprobar su `entitlement`; el panel no publicará rutas ni IDs de Bunny en
  `public`.
- El foro y las dudas por lección se posponen. Compartirán la misma cuenta y el
  mismo servicio de conversación; no habrá dos sistemas de comentarios.

## Comercio

- Compra individual por curso. Sin suscripción.
- El acceso se concede únicamente por la vía verificada de servidor; la página de
  éxito del navegador no concede nada.
- `orders` y `order_items` guardan importe y título del momento de la compra, y
  `terms_version` permite conservar la versión de condiciones aplicable.
- Los identificadores externos tienen restricciones de unicidad.
  `private.commerce_events` aporta idempotencia mínima de webhooks sin guardar el
  cuerpo completo del evento.
- Stripe Checkout, el webhook firmado y la emisión de tokens de Bunny **no** están
  implementados en este bloque. No hay precios reales ni claves.

## Aplicación local y pruebas

### Suite portable (PGlite, sin Docker)

```powershell
npm ci
npm run test:sql
```

`scripts/test-sql.mjs` levanta PGlite **en memoria** (`@electric-sql/pglite`,
`devDependencies`), crea un bootstrap mínimo de Supabase —roles `anon`,
`authenticated` y `service_role`, tabla `auth.users` y `auth.uid()` que lee
`request.jwt.claims`—, aplica `supabase/migrations/*.sql` y ejecuta
`supabase/tests/*.psql`. No lee `.env`, no hace red y cierra la base en `finally`;
cualquier error termina con código 1. Solo admite los metacomandos
de psql de una lista blanca exacta (`\set ON_ERROR_STOP on`); otro metacomando
	falla en vez de ignorarse.

> **LIMITADO A LÓGICA SQL/RLS, NO A SUPABASE/AUTH/POSTGREST REALES.** El
> bootstrap no reproduce GoTrue, los grants por defecto del servidor, el
> esquema `auth` completo ni los `request.jwt.claims` emitidos por PostgREST.
> Las tablas `storage.buckets` y `storage.objects` son sustitutos mínimos:
> no implementan Storage, firmas, validación MIME ni sus grants reales.
> Verde aquí no garantiza el mismo resultado en Supabase.

### Verificación posterior contra Supabase local

Requisitos, cuando toque: Docker, Supabase CLI y un cliente `psql`. No se
instalan en este bloque. `supabase/config.toml` todavía no está versionado; si
falta, el CLI puede crearlo con `supabase init` sin tocar las migraciones.

```powershell
# Una vez, con Supabase CLI disponible y Docker arrancado
supabase start
supabase db reset          # aplica las migraciones en local

# Pruebas de permisos (transacción con ROLLBACK; no dejan datos)
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" `
  -v ON_ERROR_STOP=1 -f supabase/tests/0001_academy_rls.psql
```

Esta ruta con `psql` contra Supabase local **no se ha ejecutado todavía**; no
está validada en este bloque.

La suite comprueba, entre otros casos:

- visita anónima: solo catálogo publicado y lección de muestra;
- dos alumnos con compras distintas: acceso cruzado denegado;
- curso/lección en borrador: invisible para alumnos, visible para admin;
- derecho revocado: deja de dar acceso;
- autoascenso a admin y escritura de roles: denegados;
- escritura de pedidos, precios y derechos desde cliente: denegada;
- progreso propio permitido solo con derecho activo y nunca a nombre de otro;
- admin: CRUD editorial y acceso a contenido sin compra;
- **admin: solo lee sus propios pedidos, líneas y derechos; no tiene ningún
  privilegio extra de finanzas ni de datos privados**;
- `anon` y `authenticated` no pueden leer `private.commerce_events`,
  `private.course_price_refs`, `private.profile_private`, `private.lesson_videos`
  ni `private.lesson_resources`, ni siquiera el rol admin;
- `service_role`: escribe pedidos, eventos y metadatos privados;
- grants preservados: `authenticated` no escribe pedidos, líneas ni derechos, y
  `service_role` conserva sus grants de servidor sobre `private` y comercio.

**No se ha ejecutado `supabase db reset` ni `supabase db push`.** La aplicación
remota autorizada se hizo mediante el editor SQL del panel y se verificó después
por catálogo. Aplicar cualquier
migración posterior a un proyecto remoto sigue exigiendo decisión y revisión. No
se deben usar credenciales reales en pruebas locales.

## Fuera de alcance y pendientes

- Foro completo, dudas unificadas, moderación y notificaciones: fase posterior,
  misma cuenta. El backend mínimo de comentarios por lección ya descrito no es
  ese foro y no incluye borrado, moderación, tiempo real ni contadores.
- Packs, cupones, cuestionario inicial, rutas de aprendizaje, eventos y
  ejercicios: sin tablas en esta migración.
- Reproducción privada, capítulos, reanudación y emisión de tokens: pendientes.
- Stripe Checkout, webhook firmado, conciliación, devoluciones e impuestos:
  pendientes; la política de reembolsos y retirada sigue abierta.
- Retirada o archivo de un curso: el estado `archived` oculta el catálogo y las
  lecciones. Qué ocurre con derechos ya comprados, progreso y comunicaciones al
  alumno sigue pendiente de decisión; no se promete disponibilidad perpetua.
- Panel `/admin`: cursos, bloques, lecciones, vista previa local y flujo de
  subida de PDF implementados; el enlace de vídeo está en «Estructura» y la
  subida TUS está integrada en el inspector de la lección (backend desplegado en
  DEV). Token auth de Bunny activo; modo sin firma desactivado por defecto y
  restringido a entorno `development`/`dev`. Siguen pendientes orden, precios y
  la verificación E2E real de compra y reproducción: no se afirma una prueba de
  extremo a extremo con Bunny más allá de lo comprobado en DEV.
- Portada y presentación del profesor: la portada debe presentarlo, pero
  estructura, textos, nombre, foto, credenciales y testimonios quedan para la
  fase de diseño definitivo. No se inventan datos ni se construye la landing
  ahora; la ruta raíz sigue provisional.
- Conservación y anonimización de pedidos al borrar una cuenta, auditoría de
  acciones admin, límites de abuso y copias de seguridad: pendientes de decisión.
# Preparación local de PDFs

El flujo `prepare-upload` → subida firmada sin sobrescritura → `finalize-upload` y su interfaz de administración y alumno están implementados. El usuario comunicó una subida aparentemente exitosa en desarrollo; queda por verificar el ajuste del nombre de archivo y el flujo completo, sin dar por probada la experiencia de compra o producción. La migración `20261117170000_admin_pdf_drafts.sql` permite a administradores consultar recursos finalizados de borradores; los alumnos siguen limitados a cursos y lecciones publicados y con derecho activo. La finalización comprueba tamaño, MIME y cabecera `%PDF-`, que no garantiza un PDF seguro ni constituye un antivirus: solo documentos propios de administradores, servidos como adjunto. Si falla la firma o no se sube el objeto queda una reserva pendiente no consumible que requiere futura limpieza manual. Reservas anteriores sin propietario no se pueden finalizar automáticamente. El tamaño y MIME declarados por el cliente no son prueba del contenido.

Se usa `info()` y `download()` del SDK Storage 2.119; el segundo descarga el objeto completo tras comprobar su tamaño y depende del límite del bucket. La comprobación de metadatos y la publicación no forman una transacción con Storage: evitar operaciones privilegiadas concurrentes que sustituyan o eliminen objetos. Fuentes: [info](https://supabase.com/docs/reference/javascript/file-buckets-info) y [download](https://supabase.com/docs/reference/javascript/file-buckets-download).
