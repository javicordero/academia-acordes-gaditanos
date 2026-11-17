# Academia Acordes Gaditanos

Base técnica de la academia online de guitarra para el Carnaval de Cádiz. Esta
fase levanta el proyecto Angular y su shell navegable, con **autenticación real
de Supabase** (registro, acceso, salida, confirmación y recuperación por correo)
y gestión editorial de cursos en `/admin`. Incluye el modelo de datos y permisos inicial,
versionado y probado en local. La migración inicial se aplicó al proyecto de
desarrollo con autorización explícita; siguen pendientes Auth configurado en la
nube, datos semilla, pagos, vídeo y comunidad.

El plan de producto completo está en `docs/plan-maestro.md`. Es una propuesta
viva: las decisiones pendientes no se dan por cerradas.

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
  de Bunny/Stripe en ese archivo ni en otro archivo del cliente.
- Sin esos dos valores la aplicación sigue funcionando, muestra un aviso de
  «autenticación pendiente de configuración local» y no simula cuentas ni
  accesos.
- El SDK instalado es `@supabase/supabase-js` 2.119.0 (estable). Se usa flujo
  PKCE con `detectSessionInUrl: false`; `/auth/callback` gestiona tanto `code`
  como `token_hash` del correo, sin guardarlos en logs ni en la URL final.

Para probar la integración real, una persona autorizada debe configurar en el
panel de Supabase (no se ha tocado la nube en este bloque):

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
- Modelo SQL inicial de la academia en `supabase/migrations/`: cursos, bloques,
  lecciones, muestra gratuita, precios, pedidos, derechos de acceso y progreso.
- RLS inicial y pruebas de autorización en `supabase/tests/`. La migración
  inicial sí se ha aplicado, con autorización explícita, al proyecto de
   desarrollo `academia-acordes-gaditanos-dev`, verificada por catálogo; pagos y
   datos semilla siguen pendientes.
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
- El panel editorial `/admin` dispone de gestión de cursos, bloques y lecciones mediante RLS, sin
  subidas ni datos de ejemplo. El foro y las dudas por lección se posponen y compartirán un único
  servicio de conversación, no comentarios paralelos.
- El registro no pide nombre visible: el trigger actual crea `public.profiles`
  solo con el identificador y no copia metadatos; `display_name` es de
  actualización futura. El registro no crea rol admin.
- La portada deberá presentar al profesor, pero su estructura y contenido quedan
  para el diseño definitivo. No se inventan nombre, foto, bio, credenciales ni
  testimonios; la ruta raíz sigue provisional.

## Panel de administración

La ruta `/admin` es lazy y exige sesión y rol `admin`. Permite gestionar cursos,
bloques y lecciones mediante el cliente Supabase y RLS. Las lecciones pueden
guardarse como borrador o publicarse y marcarse como muestra. Los elementos se
añaden al final: reordenar está pendiente y no se ofrecen borrados destructivos.
Los bloques de un curso publicado son visibles. No gestiona precios, vista previa
ni subidas. El Markdown se guarda como texto, sin representación HTML.

El acceso y la gestión de cursos se han probado con una cuenta administradora
real; la nueva gestión de estructura solo se ha probado localmente con mocks.
La aplicación no permite autoasignar el rol admin.

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

Todavía no están implementadas ni configuradas:

- La integración de estructura no se ha comprobado en PostgREST real; las
  pruebas automatizadas del cliente usan mocks.
- Edge Functions, datos semilla y despliegue del frontend. El esquema y la RLS
  inicial están versionados y la migración inicial se aplicó una vez al
  proyecto de desarrollo con autorización explícita.
- Stripe Checkout y webhook firmado e idempotente; ninguna página de éxito
  concede acceso por sí sola. No hay precios ni claves reales.
- Bunny Stream y emisión de tokens temporales desde servidor tras comprobar el
  derecho de acceso.
- Panel `/admin`: reordenación, precios, vista previa, subida segura de
  vídeo/recursos y respuestas a preguntas (estas últimas junto al foro) siguen
  pendientes. La gestión de bloques y lecciones no tiene verificación E2E real.
- Catálogo real de cursos, lecciones, materiales, progreso y ejercicios.
- Foro, dudas por lección, moderación y notificaciones.
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
- **Implementador principal:** GPT-6.1 Terra (OpenAI), ID de proveedor/modelo
  `openai/gpt-6.1-terra` (sin variante). Autorizado para implementación y
  reparaciones normales o complejas. Se desconoce su coste de catálogo: no se
  afirma que sea gratuito ni más barato.
- **Tareas MUY sencillas/operativas:** se reservan a los modelos gratuitos de
  OpenCode, en este orden: DeepSeek V4.1 Flash Free
  (`opencode/deepseek-v4.1-flash-free`) y, si agota cuota o no está disponible,
  Hy4 Free (`opencode/hy4-flash-free`) como última opción, decidido por quien
  orquesta y limitado a la tarea afectada. Si los gratuitos están bloqueados por
  cuota, informar antes de usar Terra en trabajo que se había asignado a los
  gratuitos; Terra está autorizado de forma general y puede usarse según la
  tarea, sin introducir nuevos proveedores.
- **Revisor preferido:** Hy4 Free, ID `opencode/hy4-flash-free` (sin cambios).
- **Fallback AMD retirado:** `tokenlab/DeepSeek-V4.1-Flash` (AMD Token Lab) ya no
  forma parte del orden de preferencia vigente; no reintroducirlo ni usarlo
  automáticamente sin que se pida expresamente.
- No usar otro proveedor o modelo de pago sin permiso explícito.
- La configuración vive en `opencode.jsonc`; no se cambia el modelo global de
  OpenCode ni el agente por defecto desde este repositorio. `opencode.jsonc` no
  admite un campo de fallback documentado: el implementador queda fijado en
  Terra y el revisor en Hy4 Free; el orden de preferencia descrito arriba es una
  pauta de orquestación, no una clave de configuración que haya que añadir.

## Aviso

`npm audit` y `npm audit --omit=dev` no informan de vulnerabilidades conocidas
(0 en ambos casos).

No se ha modificado el repositorio hermano del cancionero.
