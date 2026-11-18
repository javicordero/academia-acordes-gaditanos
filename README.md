# Academia Acordes Gaditanos

Base técnica de la academia online de guitarra para el Carnaval de Cádiz. Esta
fase levanta el proyecto Angular y su shell navegable, con **autenticación real
de Supabase** (registro, acceso, salida, confirmación y recuperación por correo)
y gestión editorial de cursos en `/admin`. Incluye el modelo de datos y permisos inicial,
versionado y probado en local. La migración inicial se aplicó al proyecto de
desarrollo con autorización explícita. La compra y el vídeo están verificados en
DEV/TEST; siguen pendientes la configuración de Auth en la nube, los precios
definitivos y el foro completo (decisión pendiente).

El plan de producto completo está en `docs/plan-maestro.md`. Es una propuesta
viva: las decisiones pendientes no se dan por cerradas.

Para PDFs privados se aplicaron las dos migraciones y se desplegó la función de
listado y descarga en desarrollo. Se verificaron el bucket, la política, los
grants y respuestas HTTP negativas. La subida, finalización e interfaz de PDFs
están implementadas. El usuario comunicó una subida aparentemente exitosa;
queda por verificar el ajuste del nombre de archivo y el flujo completo. El
historial CLI no está conciliado: no ejecutar `db push`.
Detalles en `docs/arquitectura-datos.md`.
En administración, abre los materiales de la lección, pulsa «Preparar descarga»
en el PDF listado y después «Descargar PDF» para abrirlo en tu equipo. El enlace
temporal caduca en un máximo de 60 segundos; si caduca, prepáralo de nuevo.
`npm run test:functions` ejecuta por separado los tests Node con mocks de las
funciones Edge; no sustituye la comprobación del runtime Deno ni Supabase real.

Para revisar una lección guardada sin publicarla, entra con una cuenta
administradora en `/admin`, abre la estructura del curso y pulsa «Vista previa
del aula» o «Ver en el aula» junto a la lección. La vista previa no registra
progreso ni concede compras o matrículas; el acceso a borradores depende de RLS.
El prototipo del aula comparte el índice de bloques entre la vista de alumno y
la administrativa. Los materiales son los ya autorizados. Las dudas por lección
están implementadas y verificadas en DEV (herencia por RLS/RPC, admin con
distintivo y hilos anidados); no hay foro completo. El futuro foro y las dudas
compartirán una única conversación asociada a la lección.

El editor permite elegir el tipo provisional de lección: vídeo, PDF o texto.
Para PDF, guarda primero la lección y adjunta sus documentos desde «Materiales
PDF»; si todavía no hay ninguno disponible, el aula lo indica. PDF y texto no
cargan el reproductor de vídeo. El progreso sigue siendo manual y sujeto al
derecho activo; la vista previa administrativa no lo guarda.

El formulario rápido genera la ruta de nuevas lecciones a partir del título y
conserva la ruta y el contenido previo al editar. La edición extensa de texto
queda para una fase posterior. La duración corresponde al vídeo, no a una
lección PDF o de texto: no se introduce manualmente ni se muestra a partir de
valores antiguos. Obtenerla de metadatos reales del proveedor está pendiente;
el iframe provisional no la facilita automáticamente.

## Vincular el vídeo a una lección

Con sesión de administrador, la ruta `/admin/<curso>/<lección>/video` permite
indicar el GUID de un vídeo de Bunny y vincularlo a esa lección. El botón
«Comprobar o cambiar» muestra el formulario; no se consulta ni se muestra una
ficha de vídeo al abrir la página. El GUID se valida en cliente y se comprueba
contra Bunny en servidor antes de guardarse; la biblioteca y la API key son
secretos de la Edge Function y nunca aparecen en el navegador. Si faltan esos
secretos, el servidor responde 503 y no guarda nada. El estado local y los
pasos pendientes están en `docs/video-admin-estado.md`.
En la estructura del curso, cada lección guardada ofrece «Vídeo de la lección» junto a «Materiales PDF»; las lecciones nuevas sin guardar no lo muestran.

- Desde esta misma ruta se puede subir el vídeo a Bunny con `tus-js-client@4.3.1` (MIT): la Edge Function `video-upload` concede una firma TUS temporal, el cliente solo envía bytes tras elegir archivo y pulsar «Subir a Bunny», muestra el aviso de coste y el progreso real, y «Detener» pausa sin borrar el vídeo remoto. Probado primero con mocks en jsdom y después en real: un vídeo de prueba se subió por TUS desde `/admin` y quedó listo en Bunny (verificado en DEV). El contrato de servidor y su documentación (`docs/video-upload-estado.md`) corresponden al bloque backend.

> **Documentación privada:** el repositorio será público. `docs/plan-maestro.md`
> se aporta localmente y **no se publica**; está incluido en `.gitignore` junto
> con `docs/privado/`, reservado para notas internas. El resto de `docs/` puede
> contener documentación técnica pública.
>
> Aviso: `.gitignore` no protege archivos que ya estén seguidos por Git. El plan
> y las notas internas quedan fuera del índice, pero si alguna vez se añade el
> plan por error hay que sacarlo con `git rm --cached docs/plan-maestro.md` (sin
> borrar el archivo local) y comprobar que no quede en el historial.


## Requisitos

- Node.js **24.22.3** LTS (Krypton), última revisión de la rama 24. Angular 22.2
  exige `^22.22.3 || ^24.15.0 || >=26.0.0`.
- npm **11.19.1** (incluido con Node 24.22.3).
- No hace falta instalar el CLI de Angular global: el proyecto usa el `ng` local
  de `node_modules`.

Comprueba la versión activa con `node -v` y `npm -v` antes de instalar. Si no
coincide con los requisitos, instala Node.js 24.22.3 LTS (con el instalador
oficial de Windows o con nvm-windows, como se explica abajo) y abre una
terminal nueva. El CLI de Angular comprueba la versión al arrancar y se detiene
si Node no cumple el rango admitido.

### Instalar Node en Windows con nvm-windows

Si `node` lo gestiona nvm-windows (`NVM_HOME` en `%APPDATA%\nvm` y enlace en
`C:\Program Files\nodejs`), ejecuta en una terminal normal:

```powershell
nvm install 24.22.3
nvm use 24.22.3
node -v   # debe mostrar v24.22.3
```

`nvm use` recrea el enlace de `C:\Program Files\nodejs` y puede pedir UAC; hay
que aceptarlo. Después abre una terminal nueva para que el `PATH` se refresque y
ejecuta `npm install`. No hace falta instalar el CLI de Angular global ni
ejecutar `nvm` desde scripts no interactivos.

## Versiones instaladas

| Pieza | Versión |
|---|---|
| Angular (`@angular/core`, `common`, `router`, `forms`, `compiler`) | 22.2.6 |
| Angular CLI / `@angular/build` | 22.2.7 |
| TypeScript | 6.0.3 |
| RxJS | 7.8.2 |
| tslib | 2.9.1 |
| Vitest | 4.1.12 |
| `@supabase/supabase-js` | 2.119.0 |
| jsdom | 28.1.0 |
| Prettier | 3.10.1 |
| Node.js | 24.22.3 |
| npm | 11.19.1 |

Las versiones exactas quedan fijadas en `package-lock.json` y el Node esperado
en `.nvmrc`.

## Comandos

```powershell
npm install
npm run config:init   # crea src/environments/environment.local.ts si falta
npm start             # servidor de desarrollo en http://localhost:4200
npm run build         # build de producción en dist/
npm test              # pruebas una sola vez, sin watch
npm run test:functions # tests Node de las Edge Functions con mocks
npm run test:sql      # suite SQL/RLS sobre PGlite en memoria (sin Docker ni psql)
```

`npm start`, `npm run build` y `npm test` ejecutan `config:init` automáticamente:
no fallan en un clon limpio ni en `npm ci`. Si se invoca `ng` directamente, hay
que ejecutar `npm run config:init` una vez antes.

`npm test` ejecuta Vitest con `--watch=false`. Para desarrollo interactivo de
pruebas puede usarse `npx ng test` (watch por defecto en terminal TTY).

`npm run test:sql` requiere solo `npm ci`/`npm install`: aplica las migraciones
de `supabase/migrations/` y ejecuta `supabase/tests/*.psql` en PGlite
(`@electric-sql/pglite`, `devDependencies`), sin Docker, sin `psql` y sin red. Es
**limitado a lógica SQL/RLS**: no es Supabase ni Auth ni PostgREST reales. Los
metacomandos de psql admitidos están en una lista blanca exacta dentro de
`scripts/test-sql.mjs`; cualquier otro hace fallar la ejecución. Ante un error
termina con código 1. La verificación contra Supabase local (Docker + CLI y
`psql`) sigue siendo el requisito posterior documentado en
[`docs/arquitectura-datos.md`](docs/arquitectura-datos.md).

## Configuración local de Supabase (Auth)

Angular no lee `.env`. La configuración del cliente vive en
`src/environments/environment.local.ts`, que está ignorado por Git y se crea a
partir de `src/environments/environment.local.example.ts`:

```powershell
npm run config:init
# Edita src/environments/environment.local.ts y rellena:
#   supabaseUrl: 'https://<ref>.supabase.co'
#   supabasePublishableKey: 'sb_publishable_...'
```

- La URL y la **publishable key** son públicas por diseño y llegan al
  navegador. No son secretos, pero se mantienen fuera del repositorio.
- **Nunca** poner `service_role`, la contraseña de la base de datos ni claves
  de Bunny/Stripe en ese archivo ni en otro archivo del cliente. Los secretos
  de Bunny (Library API key y Token authentication signing key) se configuran
  solo a mano como secretos de Edge Functions en Supabase.
- Sin esos dos valores la aplicación sigue funcionando, muestra un aviso de
  «autenticación pendiente de configuración local» y no simula cuentas ni
  accesos.
- El SDK instalado es `@supabase/supabase-js` 2.119.0 (estable). Se usa flujo
  PKCE con `detectSessionInUrl: false`; `/auth/callback` gestiona tanto `code`
  como `token_hash` del correo, sin guardarlos en logs ni en la URL final.

## Botón de compra TEST (maquetación)

La UI de compra solo se muestra si `checkoutTestEnabled: true` en la
configuración local ignorada; por defecto es `false` y no aparece. El botón es
un aviso visual: el cobro y el acceso dependen siempre del gate del servidor y
del webhook firmado. La compra de prueba en Stripe TEST ya se completó y dejó
pedido pagado, derecho activo y evento procesado (verificado en DEV/TEST): el
acceso TEST funciona. La compra real sigue desactivada hasta resolver las
decisiones legales, de precios y de copia de seguridad (decisión pendiente). No
hay E2E en producción ni Stripe live. El cliente no fija importes ni condiciones
comerciales.

## Vídeo de prueba local

`npm run config:init` crea también `src/environments/video-demo.local.ts`,
ignorado por Git y vacío por defecto. Para una lección que ya devuelve RLS,
edita el mapa con su ID de lección y la URL HTTPS de un vídeo propio no listado:

```ts
export const videoDemo: Readonly<Record<string, string>> = {
  'ID-DE-LECCION': 'https://youtu.be/ID_DEL_VIDEO',
};
```

Sustituye ambos marcadores; el ID de YouTube debe tener 11 caracteres. También
se acepta una URL `youtube.com/watch?v=...`, `www.youtube.com/watch?v=...`,
un embed de `www.youtube-nocookie.com` o el ID directamente. No subas el archivo
local ni pongas secretos. Es configuración compilada y visible en el navegador,
no almacenamiento privado. En desarrollo, después de cargar la lección
autorizada, se avisa y YouTube se carga solo al pulsar el botón. Su enlace puede
compartirse: **no protege contenido de pago**. En producción la demo está
deshabilitada aunque el archivo tenga valores. No hay reproducción privada,
firmas ni garantía de privacidad por usar `youtube-nocookie.com`.

El proveedor se elige con una única variable en la configuración local,
`videoPlaybackBunny`: `false` usa esta demo YouTube de desarrollo (sin llamadas
a Bunny), `true` usa la reproducción Bunny con firma emitida en servidor.

El proveedor de vídeo **elegido es Bunny Stream** (decisión del 2026-11-18),
sustituyendo la política anterior de YouTube solo como demo y Mux en evaluación.
La reproducción usa siempre un URL/token firmado emitido en servidor tras
comprobar sesión y derecho activo (o rol admin para vista previa); ninguna
clave de firma, API key ni token de larga duración llega al cliente. La
integración real está verificada en DEV: Bunny configurado, vídeo de prueba
subido y listo, token authentication activo y modo sin firma apagado. El mapa
local `video-demo.local.ts` (YouTube, ignorado) queda solo como *fallback* de
maquetación en desarrollo; no protege contenido de pago. El reproductor sigue
desacoplado del proveedor con el contrato `VideoPlaybackProvider`. Bunny no es gratuito (mínimo aproximado 1 USD/mes y
consumo variable) y no se contrata ni se añade tarjeta sin autorización explícita
del promotor; el vídeo de muestra `COLGAOS.mp4` es contenido propio y nunca se
versiona en el repositorio. Velocidad, reanudación y bucle A–B quedan para
evaluar según el proveedor; el progreso continúa siendo manual e independiente
del visionado.

El adaptador Bunny y su provider están en código y el flag público
`videoPlaybackBunny` ya se usó en DEV (por defecto `false` en la plantilla); la
Edge Function y la configuración de Bunny están operativas en desarrollo. Para
producción, el orden y el estado detallado están en `docs/video-estado.md`
(decisión pendiente).

Para reproducir la integración en otro entorno, una persona autorizada debe
configurar en el panel de Supabase:

- Site URL de desarrollo: `http://localhost:4200`.
- Redirect URL: `http://localhost:4200/auth/callback` (y el patrón con
  `?next=...` que exija el proveedor).
- Proveedor de correo y plantillas de confirmación/recuperación operativos.
  No se afirma que se envíen correos ni se promete un volumen de envío
  ilimitado: pueden aplicarse límites de tasa y de correo del proveedor.

### Rutas de autenticación

| Ruta | Uso |
| --- | --- |
| `/auth/login` | Acceso con correo y contraseña; acepta `returnUrl` solo interno. |
| `/auth/registro` | Alta con correo y contraseña; confirmación por correo si procede. |
| `/auth/recuperar` | Solicitud de enlace de cambio de contraseña (respuesta genérica). |
| `/auth/callback` | Canje del código PKCE de confirmación o recuperación. |
| `/auth/actualizar-contrasena` | Establecer la nueva contraseña con sesión vigente. |
| `/auth/cuenta-confirmada` | Fin del enlace de confirmación. |
| `/sin-acceso` | Destino para sesiones sin rol admin. |
| `/admin` | Listar, crear, editar, publicar y archivar cursos. |

`/mis-cursos` y `/auth/actualizar-contrasena` exigen sesión; `/admin` exige
además el rol `admin` leído de una consulta propia a `public.user_roles`, nunca
de metadatos editables. Los guards esperan a que se restaure la sesión y a que
termine la consulta del rol. La ruta sigue sin ser la barrera de seguridad:
RLS y servidor siguen decidiendo.

## Alcance de esta fase

- Shell responsive y accesible en español: cabecera, navegación, contenido y pie.
- Rutas lazy: `/cursos`, `/aula`, `/mis-cursos`, `/comunidad` y comodín 404.
- Redirección de `/` a `/cursos`.
- Páginas placeholder honestas: no hay matrículas ni compras simuladas. La
  autenticación es real pero queda inactiva hasta configurar la URL y la
  publishable key locales.
- Registro, acceso, salida, confirmación por correo y recuperación de
  contraseña con Supabase Auth; cliente singleton y estado de sesión con
  signals; guards de sesión y admin; gestión de cursos en `/admin`.
- Ruta lazy `/aula/:courseSlug/:lessonSlug` sin guard global de sesión: las
  lecciones visibles y el progreso los decide RLS, no la ruta de Angular. La
  ficha pública de curso enlaza solo las lecciones accesibles devueltas por RLS
  (muestra, compradas o visibles para admin) con el slug real del curso y de la
  lección. La lección de muestra es accesible sin sesión; guardar progreso
  requiere un derecho activo incluso para admin y para la muestra.
- Retorno de compra **en local**: la URL de éxito lleva solo el `order_id`
  reservado y `/mis-cursos` contrasta pedidos y derechos propios por RLS sin
  conceder acceso; comprueba `pending`/`confirmed`/`error` con cuatro intentos
  acotados (1500/3000/6000 ms) y reintento manual. La compra TEST se completó de
  extremo a extremo (verificado en DEV/TEST); no hay E2E en producción y el
  despliegue remoto lo decide el operador cloud.
- Modelo SQL inicial de la academia en `supabase/migrations/`: cursos, bloques,
  lecciones, muestra gratuita, precios, pedidos, derechos de acceso y progreso.
- RLS inicial y pruebas de autorización en `supabase/tests/`. La migración
  inicial sí se ha aplicado, con autorización explícita, al proyecto de
   desarrollo `academia-acordes-gaditanos-dev`, verificada por catálogo; ya hay
   curso y lecciones publicados usados en las pruebas en DEV/TEST.
- Pruebas del shell y de las rutas (render, títulos y 404), además de pruebas
  unitarias con mocks del SDK para sesión, roles, guards, formularios, callback
  PKCE y seguridad de `returnUrl`.
- Angular standalone, strict, SCSS, routing, zoneless y Vitest.
- Sin SSR: la aplicación se sirve como CSR estático.

## Datos y permisos (base)

El detalle está en [`docs/arquitectura-datos.md`](docs/arquitectura-datos.md).

- La autorización real vive en RLS y en servidor; Angular nunca es la única
  barrera.
- La compra es individual por curso, sin suscripción y sin caducidad programada.
  El derecho es revocable explícitamente desde servidor; no implica promesa de
  disponibilidad perpetua.
- La lección de muestra se marca por lección. El resto exige un derecho activo.
- El progreso es manual y solo se registra con derecho vigente.
- Los IDs de vídeo, rutas de recursos, precios de proveedor y eventos de comercio
  viven en el esquema `private`, no expuesto a la API.
- El rol admin se guarda en una tabla server-only y no se puede autoasignar.
- El panel editorial `/admin` dispone de gestión de cursos, bloques y lecciones mediante RLS, con
  subida de vídeo y reordenación verificadas en DEV. Las dudas por lección están
  implementadas (verificado en DEV); el foro completo sigue en fase posterior y
  compartirá un único servicio de conversación, no comentarios paralelos.
- El registro no pide nombre visible: el trigger actual crea `public.profiles`
  solo con el identificador y no copia metadatos; `display_name` es de
  actualización futura. El registro no crea rol admin.
- La portada deberá presentar al profesor, pero su estructura y contenido quedan
  para el diseño definitivo. No se inventan nombre, foto, bio, credenciales ni
  testimonios; la ruta raíz sigue provisional.

## Panel de administración

La ruta `/admin` es lazy y exige sesión y rol `admin`. Permite gestionar cursos,
bloques y lecciones mediante el cliente Supabase y RLS. Las lecciones pueden
guardarse como borrador o publicarse y marcarse como muestra. El editor se ha
rediseñado a dos paneles con un panel de estilos unificado; la reordenación con
arrastrar y soltar usa una RPC atómica y está verificada en DEV. No se ofrecen
borrados destructivos. Los bloques de un curso publicado son visibles. La vista
previa administrativa está implementada localmente para lecciones guardadas,
también borradores. Las interfaces de subida de PDF y de vídeo están
implementadas y verificadas en DEV; los precios definitivos siguen pendientes
(decisión pendiente). El Markdown se guarda como texto, sin representación HTML.

El acceso y la gestión de cursos se han probado con una cuenta administradora
real; la estructura y la subida de vídeo se han verificado en DEV. La
aplicación no permite autoasignar el rol admin.

## Estructura

```text
src/
  app/
    app.ts, app.html, app.scss       # shell
    app.routes.ts                     # rutas lazy
    app.spec.ts                       # pruebas del shell
    app.routes.spec.ts                # pruebas de rutas
    core/
      auth/                           # servicio de sesión, guards y utilidades
      supabase/                       # cliente singleton inyectable
    features/
      cursos/
      aula/                           # vista de lección y progreso manual
      mis-cursos/
      comunidad/
      not-found/
      auth/                           # login, registro, recuperación, callback...
      admin/                          # gestión editorial de cursos
  styles.scss                         # estilos globales
src/environments/
  environment.local.example.ts        # plantilla versionada
  environment.local.ts                # copia local ignorada por Git
supabase/
  migrations/                         # esquema SQL versionado
  tests/                              # pruebas de RLS (transacción + rollback)
scripts/test-sql.mjs                  # runner portable de la suite SQL/RLS (PGlite)
scripts/ensure-local-config.mjs       # generador de configuración local
docs/arquitectura-datos.md            # modelo, permisos y límites
docs/plan-maestro.md                  # plan local, ignorado; no se publica
docs/privado/                         # notas internas futuras, ignoradas
opencode.jsonc                        # agentes OpenCode V2 del proyecto
AGENTS.md                             # instrucciones para agentes
```

## Integraciones pendientes

Estado verificado en DEV/TEST y lo que sigue pendiente:

- La reordenación de estructura está implementada con RPC atómica; las pruebas
  automatizadas del cliente usan mocks y no sustituyen la verificación en
  producción.
- Despliegue del frontend. Ya hay curso y lecciones publicados para probar aula
  y acceso. Las funciones de PDF existen; otras integraciones de servidor
  siguen pendientes. El esquema y la RLS inicial están versionados y se
  aplicaron a desarrollo con autorización explícita.
- Stripe Checkout y webhook firmado e idempotente están implementados y
  verificados en TEST (pedido pagado, derecho activo y evento procesado en modo
  TEST); la página de éxito no concede acceso por sí sola. Los precios
  definitivos y Stripe live siguen pendientes (decisión pendiente).
- Bunny Stream (proveedor elegido) configurado y verificado en DEV: token de
  reproducción firmado en servidor, vídeo de prueba subido y listo, token
  authentication activo y modo sin firma apagado. YouTube solo queda como flag
  local de desarrollo. El token no es DRM: el enlace puede compartirse hasta
  que caduque y no impide grabar la pantalla.
- Panel `/admin`: reordenación, vista previa y subida de vídeo funcionan en DEV;
  siguen pendientes los precios definitivos y las respuestas a preguntas (junto
  al foro), además del diseño definitivo (decisión pendiente). La prueba E2E se
  hizo en TEST; no hay E2E en producción.
- Ampliación del catálogo y ejercicios; el curso y las lecciones publicados ya
  se usan en DEV/TEST.
- Foro completo, moderación y notificaciones; las dudas por lección ya están
  implementadas (verificado en DEV).
- Portada con presentación del profesor; estructura y contenido pendientes de la
  fase de diseño definitivo, sin datos inventados.
- Analítica propia y textos legales.

No hay `.env.example`: Angular no lee `.env` y la configuración pública se
guarda en el archivo local ignorado descrito arriba. No se deben añadir
secretos al repositorio.

## Decisiones técnicas de esta fase

- Angular 22.2, última línea estable, con Node 24 LTS.
- Standalone + routing + SCSS + strict, sin SSR hasta que exista una decisión
  SEO concreta.
- Zoneless (sin `zone.js`) y Vitest.
- npm como único gestor; sin pnpm, yarn ni Corepack.
- El CLI global no se modifica; se usa la versión local declarada en
  `devDependencies`.
- PostgreSQL/Supabase con migraciones SQL versionadas, RLS en todas las tablas
  públicas y un esquema `private` para identificadores y datos de servidor.
- El acceso comprado no caduca por fecha, pero es revocable desde servidor. No
  hay suscripción.
- Las pruebas SQL se ejecutan en transacción con `ROLLBACK`; no dejan datos.

## Agentes y skill de Angular

Los subagentes deben cargar la skill project-local `angular-developer`
(`.opencode/skills/angular-developer/`) para tareas Angular pertinentes,
respetando la versión del proyecto y las reglas de `AGENTS.md`. Cargar la skill
no autoriza a instalar el MCP de Angular, `angular-new-app` ni otros paquetes
mediante `npx`. La procedencia, la revisión fija y el método de actualización
están en `UPSTREAM.md`.

Modelos autorizados para el flujo de agentes del proyecto:

- **Sol** coordina, revisa y decide.
- **Implementador principal:** DeepSeek V4.1 Flash de AMD Token Lab, ID de
  proveedor/modelo `tokenlab/DeepSeek-V4.1-Flash` (sin variante). Autorizado
  expresamente por el usuario para implementación y reparaciones normales o
  complejas. Se desconoce su coste de catálogo: no se afirma que sea gratuito
  ni más barato.
- **Tareas MUY sencillas/operativas:** se reservan a los modelos gratuitos de
  OpenCode, como fallback inmediato DeepSeek V4.1 Flash Free
  (`opencode/deepseek-v4.1-flash-free`) y, si agota cuota o no está disponible,
  Hy4 Free (`opencode/hy4-flash-free`) como última opción, decidido por quien
  orquesta y limitado a la tarea afectada. AMD puede tener limitaciones de
  capacidad: ante un fallo por capacidad, no ignorar el error, no entrar en
  bucle de reintento y no quedarse esperando; reportarlo a quien orquesta. Si
  los gratuitos están bloqueados por cuota, informar a quien orquesta antes de
  seguir.
- **Revisor preferido:** Hy4 Free, ID `opencode/hy4-flash-free` (sin cambios).
- No usar otro proveedor o modelo de pago sin permiso explícito.
- La configuración vive en `opencode.jsonc`; no se cambia el modelo global de
  OpenCode ni el agente por defecto desde este repositorio. `opencode.jsonc` no
  admite un campo de fallback documentado: el implementador queda fijado en
  DeepSeek V4.1 Flash de AMD y el revisor en Hy4 Free; el orden de preferencia
  descrito arriba es una pauta de orquestación, no una clave de configuración
  que haya que añadir.

## Aviso

`npm audit` y `npm audit --omit=dev` no informan de vulnerabilidades conocidas
(0 en ambos casos).

No se ha modificado el repositorio hermano del cancionero.
