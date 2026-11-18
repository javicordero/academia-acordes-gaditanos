# AGENTS.md

## Contexto

Academia online de guitarra para el Carnaval de Cádiz, conectada comercialmente con Acordes Gaditanos. El plan de producto completo está en `docs/plan-maestro.md` (copia literal e inmutable del documento del promotor). Es una propuesta: las decisiones marcadas como pendientes no se inventan ni se dan por cerradas.

El repositorio hermano del cancionero (`acordes-gaditanos`) no se toca. Lo que se reutilice de él se copia aquí, conservando licencias y sin arrastrar cuentas, datos personales ni secretos.

## Stack y reglas técnicas

- **Angular 22.2**, standalone, strict, routing, SCSS y npm. Node.js 24 LTS (`>=24.15.0`). No usar pnpm, yarn ni Corepack. No reinstalar ni cambiar el CLI global: el proyecto usa el `ng` local (`npm run ng` o `npx ng`).
- **Supabase** para PostgreSQL, Auth, RLS y Edge Functions. Los permisos se comprueban en base de datos/servidor; Angular nunca es la única barrera. El `service_role` solo vive en servidor. Las migraciones se versionan en `supabase/migrations/` y las pruebas de RLS en `supabase/tests/`; no aplicar a una base remota sin revisión y permiso.
- **Stripe**: el acceso se concede por un webhook firmado, verificado e idempotente. La página de éxito no concede acceso. Precios e importes se calculan en servidor.
- **Vídeo**: Bunny Stream es el proveedor elegido (decisión del 2026-11-18), con reproducción siempre mediante URL/token firmado emitido en servidor tras verificar sesión y derecho activo (o rol admin para vista previa); ninguna clave de firma ni API key en cliente. No es DRM ni promete protección absoluta. Bunny no es gratuito (mínimo aprox. 1 USD/mes y consumo variable): nada se contrata ni se añade tarjeta sin autorización explícita. El fallback de maquetación es YouTube en el mapa local ignorado `video-demo.local.ts`, solo si Bunny no está configurado, y nunca protege contenido de pago. El reproductor se mantiene desacoplado del proveedor.
- **Sin SSR por ahora**: Angular CSR estático. No introducirlo sin una decisión SEO concreta.
- Sin AdSense ni GTM en la academia. La analítica, si se añade, usa una propiedad GA4 de Acordes Gaditanos distinta de la del cancionero y consentimiento previo. Si la academia se sirve desde un subdominio de la web principal, debe compartir su misma propiedad y flujo de datos web, salvo decisión explícita de separación por equipo, acceso o retención.

## Seguridad y datos

- Nunca incluir secretos, claves, tokens, contraseñas, correos de alumnos, ventas ni datos personales en el repositorio.
- El repositorio será público. `docs/plan-maestro.md` es local y está ignorado; no publicarlo ni forzarlo con `git add -f`. `docs/privado/` es para notas internas y también está ignorado. La documentación técnica pública sí puede vivir en `docs/`.
- `.gitignore` no protege archivos ya seguidos: comprobar el índice antes de publicar.
- `.env` está ignorado. Si hace falta una plantilla, `.env.example` solo lleva nombres y valores ficticios. Angular no lee `.env`: la configuración pública de Supabase vive en `src/environments/environment.local.ts` (ignorado, creado por `npm run config:init` desde la plantilla versionada). Solo URL y publishable key; nunca secretos.
- No confiar en ocultar rutas de Angular: toda autorización real va en RLS/Edge Functions.
- El esquema `private` no se expone a la API: IDs de Bunny, rutas de Storage, precios de proveedor, datos personales y eventos de comercio viven ahí. No guardar IDs de vídeo ni rutas de recursos en filas públicas.
- Pedidos, precios, derechos de acceso (`entitlements`) y roles se escriben solo desde servidor. El rol admin no se puede autoasignar desde una cuenta de alumno.
- Los archivos y vídeos de pago serán privados; las URLs firmadas y los tokens se emiten en servidor tras comprobar el derecho. La demo YouTube de maquetación es compartible y no protege contenido de pago. Ninguna clave de proveedor o Stripe en el cliente. Los secretos de Bunny (Library API key y signing key) se configuran a mano como secretos de Edge Functions en Supabase, nunca en el repositorio, el chat, `environment.local.ts` ni filas públicas.
- En `private.lesson_videos` (esquema privado, no expuesto a la API) viven como mínimo `lesson_id`, `provider` = 'bunny', el library ID y el GUID del vídeo, el estado de procesamiento y la duración; jamás en `public.lessons` ni en la respuesta pública del catálogo.
- No prometer protección absoluta de vídeo, corrección automática de audio ni capacidades no verificadas.

## Producto

- No inventar precios, duración del acceso, visibilidad del foro, política de reembolsos, número de cursos ni otras decisiones abiertas del plan.
- Compra individual por curso, sin suscripción. El acceso no tiene caducidad programada, pero es revocable desde servidor (reembolso, contracargo u operación de soporte según la política que se apruebe). No prometer disponibilidad perpetua.
- El progreso es manual. La lección de muestra se marca por lección; el resto exige derecho activo.
- Panel de administración propio: requisito confirmado. Ruta `/admin` lazy en el futuro, con CRUD editorial de cursos, bloques y orden, lecciones, borradores y vista previa, metadatos de vídeo y documentos anexos. La subida de vídeo y los archivos privados van por servidor. No crear UI ni subidas reales hasta que toque.
- Foro y dudas por lección: fase posterior, misma cuenta. Las preguntas usarán un único servicio de conversación; no crear un sistema de comentarios paralelo.
- La portada debe presentar al profesor, pero estructura, textos, nombre, foto, bio, credenciales y testimonios quedan para el diseño definitivo. No inventarlos ni construir la landing ahora; la raíz sigue provisional.
- El estilo visual actual es provisional; no invertir en acabado hasta el rediseño, pero mantener accesibilidad, responsive y tokens separados de los estilos de componente.
- Las páginas de esta fase son placeholders honestos: sin auth ni pagos simulados que parezcan reales.
- Interfaz en español, responsive y accesible (teclado, foco visible, etiquetas, contraste, `lang="es"`).

## Flujo de trabajo

- Tareas pequeñas y verificables. Antes de ampliar alcance, comprobar el plan y las decisiones pendientes.
- Comandos: `npm install`, `npm start`, `npm run build`, `npm test` (una pasada, sin watch) y `npm run test:sql`. `test:sql` ejecuta `supabase/migrations/` y `supabase/tests/*.psql` sobre PGlite en memoria (`scripts/test-sql.mjs`), sin Docker ni `psql`; solo valida lógica SQL/RLS, no es Supabase/Auth/PostgREST real. La verificación real (Supabase local con Docker + CLI y `psql`) queda documentada en `docs/arquitectura-datos.md` como requisito posterior.
- Toda funcionalidad nueva debe incluir pruebas proporcionadas a su riesgo.
- Para tareas Angular pertinentes, los subagentes cargan la skill project-local `angular-developer` y respetan la versión del proyecto y estas reglas. Cargarla no autoriza a instalar MCP, `angular-new-app` ni paquetes extra vía `npx`; procedencia y actualización en `.opencode/skills/angular-developer/UPSTREAM.md`.
- Actualizar `README.md` y la documentación cuando cambien comandos, arquitectura o alcance. No editar `docs/plan-maestro.md`.
- Informes breves: qué se hizo, cómo se verificó y limitaciones. Solo el subagente designado y autorizado para Git hace commits; los implementadores no hacen commits por iniciativa propia. No hacer push sin permiso (ver «Commits»).
- **Sol** coordina, revisa y decide, e interviene directamente solo cuando la complejidad lo justifique. **Todas las tareas operativas, incluidas las de Git, se delegan a subagentes.** Los implementadores no hacen commits por iniciativa propia; solo el subagente designado y autorizado para Git ejecuta los commits que coordina el agente padre.
- **Implementador principal:** DeepSeek V4.1 Flash de AMD Token Lab, ID `tokenlab/DeepSeek-V4.1-Flash` (sin variante). El usuario lo autoriza expresamente para implementación y reparaciones normales o complejas. Se desconoce su coste de catálogo: no afirmar que es gratuito ni más barato.
- **Tareas MUY sencillas/operativas:** se reservan a los modelos gratuitos de OpenCode, como fallback inmediato DeepSeek V4.1 Flash Free, ID `opencode/deepseek-v4.1-flash-free`; si agota cuota o no está disponible, Hy4 Free, ID `opencode/hy4-flash-free`, como última opción, lo decide quien orquesta y queda limitado a la tarea afectada. AMD puede tener limitaciones de capacidad: ante un fallo por capacidad, no ignorar el error, no entrar en bucle de reintento y no quedarse esperando; reportarlo a quien orquesta. Si los modelos gratuitos están bloqueados por cuota, informar a quien orquesta antes de seguir.
- **Revisor preferido:** Hy4 Free, ID `opencode/hy4-flash-free` (se mantiene como hasta ahora).
- `opencode.jsonc` no tiene campo de fallback: `agents.implementador.model` fija el principal en DeepSeek V4.1 Flash de AMD. El orden de preferencia descrito arriba lo aplica quien orquesta, limitado a la tarea afectada; no inventar claves de configuración para esto.
- No cambiar el modelo global de OpenCode ni el agente por defecto del usuario. La configuración de agentes vive en `opencode.jsonc` y la ajusta el agente autorizado.

## Commits

- El usuario autoriza commits **locales** pequeños, por unidad coherente y verificada.
- Incluir solo archivos de la tarea revisados explícitamente. Nunca `git add .` ni añadir arrastrando cambios ajenos.
- Prohibido incluir secretos, datos personales o el plan privado (`docs/plan-maestro.md` y `docs/privado/`).
- No hacer push, publicar ni abrir PR sin permiso explícito.
- Los commits los coordina el agente padre tras la revisión, pero los ejecuta un único subagente designado y autorizado para Git; nunca varios subagentes compitiendo por el índice. Solo el subagente designado y autorizado para Git hace commits; los implementadores no hacen commits por iniciativa propia.

## Estructura

- `src/app/` — shell, rutas y páginas.
- `src/app/features/` — páginas por área (`cursos`, `mis-cursos`, `comunidad`, `not-found`).
- `supabase/migrations/` — esquema SQL versionado; no aplicar a remoto sin permiso.
- `supabase/tests/` — pruebas de RLS en transacción con `ROLLBACK`.
- `docs/arquitectura-datos.md` — modelo público, matriz de permisos y límites.
- `docs/plan-maestro.md` — plan de producto local e ignorado; no se publica.
- `docs/privado/` — notas internas futuras, ignoradas.
- `docs/` — documentación técnica pública permitida.
- `public/` — estáticos.
