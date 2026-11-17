# Academia Acordes Gaditanos

Base técnica de la academia online de guitarra para el Carnaval de Cádiz. Esta
fase solo levanta el proyecto Angular y su shell navegable; **no hay cursos,
cuentas, pagos ni comunidad activos**.

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
| jsdom | 28.1.0 |
| Prettier | 3.10.1 |
| Node.js | 24.22.3 |
| npm | 11.19.1 |

Las versiones exactas quedan fijadas en `package-lock.json` y el Node esperado
en `.nvmrc`.

## Comandos

```powershell
npm install
npm start          # servidor de desarrollo en http://localhost:4200
npm run build      # build de producción en dist/
npm test           # pruebas una sola vez, sin watch
```

`npm test` ejecuta Vitest con `--watch=false`. Para desarrollo interactivo de
pruebas puede usarse `npx ng test` (watch por defecto en terminal TTY).

## Alcance de esta fase

- Shell responsive y accesible en español: cabecera, navegación, contenido y pie.
- Rutas lazy: `/cursos`, `/mis-cursos`, `/comunidad` y comodín 404.
- Redirección de `/` a `/cursos`.
- Páginas placeholder honestas, sin simular autenticación, matrículas ni compras.
- Pruebas del shell y de las rutas (render, títulos y 404).
- Angular standalone, strict, SCSS, routing, zoneless y Vitest.
- Sin SSR: la aplicación se sirve como CSR estático.

## Estructura

```text
src/
  app/
    app.ts, app.html, app.scss       # shell
    app.routes.ts                     # rutas lazy
    app.spec.ts                       # pruebas del shell
    app.routes.spec.ts                # pruebas de rutas
    features/
      cursos/
      mis-cursos/
      comunidad/
      not-found/
  styles.scss                         # estilos globales
docs/plan-maestro.md                  # plan local, ignorado; no se publica
docs/privado/                         # notas internas futuras, ignoradas
opencode.jsonc                        # agentes OpenCode V2 del proyecto
AGENTS.md                             # instrucciones para agentes
```

## Integraciones pendientes

Todavía no están implementadas ni configuradas:

- Supabase (PostgreSQL, Auth, perfiles, roles, RLS, migraciones y Edge Functions).
- Stripe Checkout y webhook firmado e idempotente; ninguna página de éxito
  concede acceso por sí sola.
- Bunny Stream y emisión de tokens temporales desde servidor tras comprobar el
  derecho de acceso.
- Catálogo real de cursos, lecciones, materiales, progreso y ejercicios.
- Foro, dudas por lección, moderación y notificaciones.
- Analítica propia y textos legales.

Por eso no hay `.env.example` todavía: no existe ninguna variable de entorno
necesaria. No se deben añadir secretos al repositorio.

## Decisiones técnicas de esta fase

- Angular 22.2, última línea estable, con Node 24 LTS.
- Standalone + routing + SCSS + strict, sin SSR hasta que exista una decisión
  SEO concreta.
- Zoneless (sin `zone.js`) y Vitest.
- npm como único gestor; sin pnpm, yarn ni Corepack.
- El CLI global no se modifica; se usa la versión local declarada en
  `devDependencies`.

## Agentes y skill de Angular

Los subagentes deben cargar la skill project-local `angular-developer`
(`.opencode/skills/angular-developer/`) para tareas Angular pertinentes,
respetando la versión del proyecto y las reglas de `AGENTS.md`. Cargar la skill
no autoriza a instalar el MCP de Angular, `angular-new-app` ni otros paquetes
mediante `npx`. La procedencia, la revisión fija y el método de actualización
están en `UPSTREAM.md`.

## Aviso

`npm audit` y `npm audit --omit=dev` no informan de vulnerabilidades conocidas
(0 en ambos casos).

No se ha modificado el repositorio hermano del cancionero.
