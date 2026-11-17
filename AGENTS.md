# AGENTS.md

## Contexto

Academia online de guitarra para el Carnaval de Cádiz, conectada comercialmente con Acordes Gaditanos. El plan de producto completo está en `docs/plan-maestro.md` (copia literal e inmutable del documento del promotor). Es una propuesta: las decisiones marcadas como pendientes no se inventan ni se dan por cerradas.

El repositorio hermano del cancionero (`acordes-gaditanos`) no se toca. Lo que se reutilice de él se copia aquí, conservando licencias y sin arrastrar cuentas, datos personales ni secretos.

## Stack y reglas técnicas

- **Angular 22.2**, standalone, strict, routing, SCSS y npm. Node.js 24 LTS (`>=24.15.0`). No usar pnpm, yarn ni Corepack. No reinstalar ni cambiar el CLI global: el proyecto usa el `ng` local (`npm run ng` o `npx ng`).
- **Supabase** para PostgreSQL, Auth, RLS y Edge Functions. Los permisos se comprueban en base de datos/servidor; Angular nunca es la única barrera. El `service_role` solo vive en servidor.
- **Stripe**: el acceso se concede por un webhook firmado, verificado e idempotente. La página de éxito no concede acceso. Precios e importes se calculan en servidor.
- **Bunny Stream**: los tokens de reproducción son temporales y se emiten en una Edge Function tras comprobar el derecho de acceso. Ninguna clave de firma en el cliente.
- **Sin SSR por ahora**: Angular CSR estático. No introducirlo sin una decisión SEO concreta.
- Sin AdSense ni GTM en la academia. La analítica, si se añade, usa una propiedad propia y consentimiento.
- No cambiar el modelo global de OpenCode ni el agente por defecto del usuario.

## Seguridad y datos

- Nunca incluir secretos, claves, tokens, contraseñas, correos de alumnos, ventas ni datos personales en el repositorio.
- El repositorio será público. `docs/plan-maestro.md` es local y está ignorado; no publicarlo ni forzarlo con `git add -f`. `docs/privado/` es para notas internas y también está ignorado. La documentación técnica pública sí puede vivir en `docs/`.
- `.gitignore` no protege archivos ya seguidos: comprobar el índice antes de publicar.
- `.env` está ignorado. Si hace falta una plantilla, `.env.example` solo lleva nombres y valores ficticios.
- No confiar en ocultar rutas de Angular: toda autorización real va en RLS/Edge Functions.
- No prometer protección absoluta de vídeo, corrección automática de audio ni capacidades no verificadas.

## Producto

- No inventar precios, duración del acceso, visibilidad del foro, política de reembolsos, número de cursos ni otras decisiones abiertas del plan.
- Las páginas de esta fase son placeholders honestos: sin auth ni pagos simulados que parezcan reales.
- Interfaz en español, responsive y accesible (teclado, foco visible, etiquetas, contraste, `lang="es"`).

## Flujo de trabajo

- Tareas pequeñas y verificables. Antes de ampliar alcance, comprobar el plan y las decisiones pendientes.
- Comandos: `npm install`, `npm start`, `npm run build`, `npm test` (una pasada, sin watch).
- Toda funcionalidad nueva debe incluir pruebas proporcionadas a su riesgo.
- Para tareas Angular pertinentes, los subagentes cargan la skill project-local `angular-developer` y respetan la versión del proyecto y estas reglas. Cargarla no autoriza a instalar MCP, `angular-new-app` ni paquetes extra vía `npx`; procedencia y actualización en `.opencode/skills/angular-developer/UPSTREAM.md`.
- Actualizar `README.md` y la documentación cuando cambien comandos, arquitectura o alcance. No editar `docs/plan-maestro.md`.
- Informes breves: qué se hizo, cómo se verificó y limitaciones. Solo el subagente designado y autorizado para Git hace commits; los implementadores no hacen commits por iniciativa propia. No hacer push sin permiso (ver «Commits»).
- Todas las tareas operativas, incluidas las de Git, se delegan a subagentes gratuitos. Sol coordina, revisa y decide, e interviene directamente solo cuando la complejidad lo justifique.
- Implementan modelos gratuitos; Sol coordina, revisa y decide. Los subagentes `implementador` y `revisor` están definidos en `opencode.jsonc`; el revisor no edita.

## Commits

- El usuario autoriza commits **locales** pequeños, por unidad coherente y verificada.
- Incluir solo archivos de la tarea revisados explícitamente. Nunca `git add .` ni añadir arrastrando cambios ajenos.
- Prohibido incluir secretos, datos personales o el plan privado (`docs/plan-maestro.md` y `docs/privado/`).
- No hacer push, publicar ni abrir PR sin permiso explícito.
- Los commits los coordina el agente padre tras la revisión, pero los ejecuta un único subagente designado y autorizado para Git; nunca varios subagentes compitiendo por el índice. Solo el subagente designado y autorizado para Git hace commits; los implementadores no hacen commits por iniciativa propia.

## Estructura

- `src/app/` — shell, rutas y páginas.
- `src/app/features/` — páginas por área (`cursos`, `mis-cursos`, `comunidad`, `not-found`).
- `docs/plan-maestro.md` — plan de producto local e ignorado; no se publica.
- `docs/privado/` — notas internas futuras, ignoradas.
- `docs/` — documentación técnica pública permitida.
- `public/` — estáticos.
