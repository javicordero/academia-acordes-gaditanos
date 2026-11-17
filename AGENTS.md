# AGENTS.md

## Contexto

Academia online de guitarra para el Carnaval de Cádiz, conectada comercialmente con Acordes Gaditanos. El plan de producto completo está en `docs/plan-maestro.md` (copia literal e inmutable del documento del promotor). Es una propuesta: las decisiones marcadas como pendientes no se inventan ni se dan por cerradas.

El repositorio hermano del cancionero (`acordes-gaditanos`) no se toca. Lo que se reutilice de él se copia aquí, conservando licencias y sin arrastrar cuentas, datos personales ni secretos.

## Stack y reglas técnicas

- **Angular 22.2**, standalone, strict, routing, SCSS y npm. Node.js 24 LTS (`>=24.15.0`). No usar pnpm, yarn ni Corepack. No reinstalar ni cambiar el CLI global: el proyecto usa el `ng` local (`npm run ng` o `npx ng`).
- **Supabase** para PostgreSQL, Auth, RLS y Edge Functions. Los permisos se comprueban en base de datos/servidor; Angular nunca es la única barrera. El `service_role` solo vive en servidor. Las migraciones se versionan en `supabase/migrations/` y las pruebas de RLS en `supabase/tests/`; no aplicar a una base remota sin revisión y permiso.
- **Stripe**: el acceso se concede por un webhook firmado, verificado e idempotente. La página de éxito no concede acceso. Precios e importes se calculan en servidor.
- **Bunny Stream**: los tokens de reproducción son temporales y se emiten en una Edge Function tras comprobar el derecho de acceso. Ninguna clave de firma en el cliente.
- **Sin SSR por ahora**: Angular CSR estático. No introducirlo sin una decisión SEO concreta.
- Sin AdSense ni GTM en la academia. La analítica, si se añade, usa una propiedad propia y consentimiento.

## Seguridad y datos

- Nunca incluir secretos, claves, tokens, contraseñas, correos de alumnos, ventas ni datos personales en el repositorio.
- El repositorio será público. `docs/plan-maestro.md` es local y está ignorado; no publicarlo ni forzarlo con `git add -f`. `docs/privado/` es para notas internas y también está ignorado. La documentación técnica pública sí puede vivir en `docs/`.
- `.gitignore` no protege archivos ya seguidos: comprobar el índice antes de publicar.
- `.env` está ignorado. Si hace falta una plantilla, `.env.example` solo lleva nombres y valores ficticios. Angular no lee `.env`: la configuración pública de Supabase vive en `src/environments/environment.local.ts` (ignorado, creado por `npm run config:init` desde la plantilla versionada). Solo URL y publishable key; nunca secretos.
- No confiar en ocultar rutas de Angular: toda autorización real va en RLS/Edge Functions.
- El esquema `private` no se expone a la API: IDs de Bunny, rutas de Storage, precios de proveedor, datos personales y eventos de comercio viven ahí. No guardar IDs de vídeo ni rutas de recursos en filas públicas.
- Pedidos, precios, derechos de acceso (`entitlements`) y roles se escriben solo desde servidor. El rol admin no se puede autoasignar desde una cuenta de alumno.
- Los archivos y vídeos serán privados; las URLs firmadas y los tokens se emiten en servidor tras comprobar el derecho. Ninguna clave de Bunny o Stripe en el cliente.
- No prometer protección absoluta de vídeo, corrección automática de audio ni capacidades no verificadas.

## Producto

- No inventar precios, duración del acceso, visibilidad del foro, política de reembolsos, número de cursos ni otras decisiones abiertas del plan.
- Compra individual por curso, sin suscripción. El acceso no tiene caducidad programada, pero es revocable desde servidor (reembolso, contracargo u operación de soporte según la política que se apruebe). No prometer disponibilidad perpetua.
- El progreso es manual. La lección de muestra se marca por lección; el resto exige derecho activo.
- Panel de administración propio: requisito confirmado. Ruta `/admin` lazy en el futuro, con CRUD editorial de cursos, bloques y orden, lecciones, borradores y vista previa, metadatos de vídeo y documentos anexos. La subida a Bunny y los archivos privados van por servidor. No crear UI ni subidas reales hasta que toque.
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
- **Implementador principal:** DeepSeek V4.1 Flash Free, ID `opencode/deepseek-v4.1-flash-free`. **Fallback de implementación:** Hy4 Free, ID `opencode/hy4-flash-free`, lo decide quien orquesta y queda limitado a la tarea afectada. **Revisor preferido:** Hy4 Free, ID `opencode/hy4-flash-free`.
- **Último recurso autorizado:** si los modelos gratuitos de OpenCode agotan cuota o no están disponibles, se puede usar `tokenlab/DeepSeek-V4.1-Flash` (AMD Token Lab). El usuario autorizó explícitamente este retroceso; se usa solo cuando Free falla, no por preferencia. El proveedor tuvo saturaciones previas, así que no se reintenta mientras haya un modelo Free disponible. Se desconoce su coste de catálogo: no afirmar que es gratuito. No usar ningún otro proveedor o modelo de pago sin permiso explícito.
- `opencode.jsonc` no tiene campo de fallback: `agents.implementador.model` fija el principal en DeepSeek Free. El orden de preferencia (DeepSeek Free → Hy4 Free → AMD como último recurso) lo aplica quien orquesta, limitado a la tarea afectada; no inventar claves de configuración para esto.
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
