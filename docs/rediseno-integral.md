# Rediseño integral de la academia — documento de encargo

Documento técnico público. Es un **encargo de trabajo**, no código y no una
decisión cerrada: describe el estado real del proyecto y delega en el agente que
ejecute el rediseño las propuestas concretas de color de fuerza, jerarquías y
acabado visual. La fuente de verdad de los valores es el código
(`src/app/core/theme/`, `src/styles.scss`) y, para producto, `AGENTS.md` y los
documentos de `docs/` enlazados en el apéndice. Si este documento y el código
discrepan, manda el código.

> Tres cuestiones quedan **explícitamente abiertas** y no se resuelven aquí: el
> tercer color de acento (§2.2), la jerarquía visual y tipográfica de cada página
> (§3 y §4) y las mejoras de estilo de secciones, cards y hovers (§10). Este
> documento da rol, requisitos, criterios y lista de archivos; la propuesta
> concreta la hace el agente de rediseño.

> **Nota de ejecución (espaciado y jerarquía):** el sistema de espaciado y
> jerarquía aprobado se ha implementado **en toda la web** sobre la escala base
> de 4 px y la escala tipográfica ~1,2, con base en Carbon, USWDS, Material 3
> (§9 de `sistema-visual.md`), los criterios WCAG de foco/objetivos táctiles y
> `clamp()` de MDN. Los tokens de `theme-tokens.scss` son la fuente de verdad
> y los consumen `styles.scss` y todas las features. La paleta (incluido
> `--accent-strong`) no se ha tocado; las decisiones abiertas que este
> documento seguía marcando como tales (tercer color y jerarquías) quedan
> implementadas con esta escala y no se reabren aquí.

---

## 1) Estado actual y alcance

### Qué hay construido

- **Angular 22.2**, standalone, strict, routing y SCSS, con npm y el `ng` local.
  Node.js 24 LTS. Sin SSR: **CSR estático**.
- **Tema único «Línea precisa»** (`linea`), fijado con `data-theme="linea"` en
  `src/index.html`, sin JavaScript, sin selector en la cabecera y sin
  persistencia. `meta[name="theme-color"]` coincide con `--bg`.
- **Supabase** (Auth, PostgreSQL/RLS, Edge Functions), **Stripe** (checkout y
  webhook firmado en servidor) y **Bunny Stream** (vídeo con token firmado en
  servidor) ya funcionan en DEV/TEST según `docs/pendientes-y-roadmap.md`.
- Catálogo, ficha de curso, aula con índice lateral, progreso manual y automático
  verificado, borradores, vista previa de administración, materiales PDF,
  favoritos, dudas por lección, foro y páginas legales orientativas.

### Qué NO se toca en este rediseño

- Lógica de negocio, autenticación, RLS, permisos, webhook, pagos, precios ni
  emisión de tokens de vídeo.
- Ninguna decisión pendiente del plan maestro (D1–D16 en
  `docs/pendientes-y-roadmap.md`): identidad legal del titular, condiciones,
  reembolsos, packs, dominio, región de Bunny, copias de seguridad, etc.
- `docs/plan-maestro.md` y `docs/privado/`: no se leen para copiar contenido, no
  se editan y no se publican.
- `angular.json`, `opencode.jsonc`, configuración de agentes ni dependencias.
- Analítica y consentimiento: se conservan tal cual; no se activa nada nuevo.
- Sin dark mode por ahora; sin SSR; sin AdSense ni GTM.

### Paleta

La paleta actual **le gusta al usuario y se conserva**. Se admite únicamente una
posible adición de un tercer color de acento «de fuerza», cuyo valor concreto se
deja abierto (§2.2).

---

## 2) Paleta y tercer color

### 2.1 Tokens de color reales (inventario)

Declarados en `src/app/core/theme/theme-tokens.scss` bajo
`:root[data-theme='linea']`. Se listan los **roles y nombres**; los valores
exactos están en ese archivo y no se reproducen aquí.

| Rol | Tokens | Uso |
| --- | --- | --- |
| Fondo / superficie / tarjeta | `--bg`, `--surface`, `--card-surface` | Fondo de página, paneles, tarjetas |
| Texto | `--ink`, `--muted` | Texto principal y secundario |
| Acento | `--accent`, `--accent-ink` | Acción y énfasis; texto sobre acento |
| Borde y foco | `--border`, `--focus` | Divisores, contornos, anillo de foco visible |
| Feedback | `--success`/`--success-ink`, `--warning`/`--warning-ink`, `--danger`/`--danger-ink`, `--info`/`--info-ink` | Estados y mensajes |
| Administración | `--admin-surface`, `--admin-surface-soft`, `--admin-surface-hover`, `--admin-field-bg`, `--admin-border`, `--admin-border-strong`, `--admin-text`, `--admin-text-muted`, `--admin-accent`, `--admin-accent-strong`, `--admin-accent-ink`, `--admin-focus`, `--admin-disabled-*`, `--admin-success*`, `--admin-warn*`, `--admin-danger*` | Misma paleta, sin paleta paralela; deriva de los roles anteriores |
| Geometría de color | `--border-width`, `--shadow-card`, `--shadow-raised`, `--list-divider` | Bordes, sombras y separadores |

**Hallazgo a corregir (sin cambiar la identidad):** `src/styles.scss` mantiene
un bloque `:root` provisional con otra paleta que queda anulada por
especificidad, y varios archivos arrastran **literales de color heredados** como
fallbacks o estados: `src/app/shared/cookie-banner/cookie-banner.scss`,
`src/app/features/legal/legal.scss`, `src/app/core/checkout/checkout-button.scss`,
`src/app/features/admin/lesson-video/lesson-video.scss`,
`src/app/features/aula/aula/aula.scss` y
`src/app/features/aula/classroom-nav.ts` (estilos inline). El rediseño debe
migrar esos valores a tokens semánticos; no introducir nuevos colores literales.

### 2.2 Tercer color de fuerza — decisión abierta

Este documento **no propone candidatos, valores ni ratios de contraste**. El
encargo para el agente que ejecute el rediseño es el siguiente:

- **Rol:** color de acento fuerte para momentos puntuales — CTA principal,
  estado activo o badge importante. No sustituye a `--accent` ni cambia la
  identidad; la paleta elegida se conserva.
- **Requisitos:**
  - contraste **AA** (texto ≥ 4,5:1; controles y bordes ≥ 3:1) en todos los
    estados y sobre todas las superficies donde se use;
  - coherencia con el acento azul vigente (`--accent`) y con los tokens de
    feedback existentes, sin paleta paralela;
  - definido como **token semántico** `--accent-strong` y su texto sobre el
    mismo `--accent-strong-ink`, declarados junto al resto de tokens;
  - uso **moderado**: regla de **máximo un elemento por vista** con este color;
  - el color nunca es el único indicador de estado: irá siempre acompañado de
    forma, texto o icono.
- **Instrucción:** *«el agente que ejecute el rediseño elegirá el color concreto
  y documentará su ratio de contraste»*.

---

## 3) HTML semántico

### 3.1 Encuadre del encargo

No se prescribe aquí una jerarquía concreta cerrada (qué página lleva h1/h2/h3
ni en qué orden). Se encarga al agente **revisar la jerarquía real** de cada
página, detectar saltos de nivel, `h1` duplicados o faltantes, títulos que
parecen subtítulos y encabezados elegidos por tamaño visual en vez de por
significado, y proponer la corrección.

**Criterios:** un solo `h1` por página; jerarquía `h1 → h2 → h3` sin saltos;
`<section>` con `aria-labelledby` hacia un encabezado real (no hacia un
`eyebrow` suelto); `<main>` único con skip-link; `<nav>` con `aria-label`;
`<article>` solo para unidades independientes; `<figure>/<figcaption>` para
imágenes con sentido; `<ul>/<li>` para colecciones; `<button>` para acciones y
`<a>` para navegación; `<time datetime>` donde aplique; `aria-current`,
`aria-pressed` y `role="status"`/`role="alert"` en los estados; foco visible y
objetivos de 44 px.

### 3.2 Lista de archivos/páginas a revisar

| Página / área | Archivos reales | Síntomas a revisar (hallazgos, no solución) |
| --- | --- | --- |
| Shell | `src/app/app.html`, `src/app/app.scss` | Skip-link y `<main id="contenido-principal">` ya correctos; `<nav aria-label>` y menú de usuario con `aria-expanded`/`aria-controls`; revisar el `<div role="dialog">` del panel móvil y el enlace de administración como navegación separada |
| Portada | `src/app/features/home/home.html`, `home.scss` | `<span class="home-button…" aria-hidden="true">` que parece CTA pero no es enlace; `id="home-cursos"` repetido en varias ramas de `@switch`; `<figure>` del profesor sin `figcaption`; `<section aria-labelledby>` hacia encabezados |
| Catálogo | `src/app/features/cursos/cursos.html`, `cursos.scss` | `aria-labelledby` apunta a `<p class="eyebrow">`; `<div class="filters" role="search">` sin formulario; botón «Reintentar» sin variante; `<ul class="cards">` correcto |
| Ficha de curso | `src/app/features/cursos/course-detail/course-detail.html`, `.scss` | Múltiples `h1` en ramas de `@switch` (uno solo se renderiza); `h2` dentro de paneles de acceso conviviendo con `h2` de sección; `<div role="group">` para bloques del temario; artículos de muestra y listas |
| Biblioteca | `src/app/features/mis-cursos/mis-cursos.html`, `.scss` | `<article>` envolviendo toda la página; dos patrones de progreso (`role="progressbar"` y `<progress>`); texto de solo lector de pantalla con `.visually-hidden` |
| Favoritos | `src/app/features/favoritos/favoritos.html`, `.scss` | `<article>` envolviendo toda la página; `h2` por curso y `<ul>` de lecciones; enlaces con texto en spans |
| Aula | `src/app/features/aula/aula/aula.html`, `.scss`, `src/app/features/aula/classroom-nav.ts`, `src/app/features/aula/lesson-materials/lesson-materials.html` | El `h1` de la lección aparece **después** de la barra de acciones y del vídeo; `h1` repetido en estados de error/denegado; `<nav aria-label="Navegación entre lecciones">` contiene controles de favorito y progreso; `<h3>` de materiales sin `h2` previo en el fragmento |
| Comentarios | `src/app/features/comentarios/conversation-view.html`, `.scss` | Plantilla recursiva con `<article>`, `<header>`, `<time datetime>`, `<ul>`; `aria-level` sobre `<li>` sin rol de lista/árbol; badge de administrador con `role="img"` |
| Foro | `src/app/features/foro/forum-categories.html`, `forum-threads.html`, `forum-thread.html` y sus `.scss` | `h1` + `h2` por tarjeta; `<time datetime>` correcto; formulario con `h2` compitiendo con el `h1` de la página |
| Perfil | `src/app/features/perfil/perfil.html`, `.scss` | `<section>` con `h1`; `<p role="status">` usado también como mensaje de ayuda; enlaces sin `aria-current` |
| Legal | `src/app/features/legal/legal.html`, `.scss` | `<p role="note">`, `<nav aria-labelledby>` e índice con `h2`; secciones `<section aria-labelledby>` con `h2`/`h3` generadas desde datos |
| Admin | `src/app/features/admin/admin.html`, `course-editor/`, `structure/`, `lesson-video/`, `preview/` | `<button>` para «Volver a cursos» (acción de navegación); `h2` de cabecera de curso conviviendo con `h2` de sección; tablas/pestañas con `role="tablist"`; atributos ARIA de drag-and-drop obsoletos (`aria-dropeffect`, `aria-grabbed`) en `structure.html` |
| Compartidos | `src/app/shared/course-card/`, `site-footer/`, `cookie-banner/`, `skeleton/` | `course-card` usa `<article>` con `h2` y patrón de enlace estirado; `site-footer` usa tres `<h2>` para agrupar enlaces; dos implementaciones de texto oculto (`.sr-only` y `.visually-hidden`) |
| Auth y 404 | `src/app/features/auth/**`, `src/app/features/not-found/not-found.html` | `h1` + formulario y `feedback` con `role`; patrón consistente, revisar `h1` único y enlaces de retorno |

### 3.3 Reglas a aplicar

1. Un solo `<main>` (ya existe en `app.html`) y un solo `h1` visible por página;
   el foco programático va al contenedor con `tabindex="-1"`, no al título.
2. Sin saltos de nivel: revisar especialmente aula y admin, donde hay
   encabezados generados por estado y por datos.
3. `<section aria-labelledby="…">` debe apuntar a un encabezado, no a un
   `eyebrow` ni a un `<p>`.
4. `<article>` para unidades independientes (tarjeta de curso, comentario,
   hilo); `<section>` para agrupaciones de una misma página.
5. `<ul>/<li>` para colecciones (categorías, lecciones, bloques, fact cards),
   con `margin: 0`, `padding: 0`, `list-style: none` salvo listas de lectura.
6. `<button>` para acciones (Reintentar, Guardar, Favorito, Progreso) y `<a>`
   para navegación. **Nunca botón dentro de enlace**. El patrón de **enlace
   estirado** ya está en `shared/course-card/course-card.html` y
   `features/home/home.html` (`home-card__link` con `position: absolute;
   inset: 0`): generalizarlo en vez de `span` con apariencia de botón.
7. `<time [attr.datetime]>` en fechas (ya en comentarios y foro); `aria-current`
   en navegación activa; `aria-pressed` en controles de alternancia (ya en
   favorito y compresión del índice); `role="status"` / `role="alert"` en
   estados, con `aria-live` solo donde aporte.
8. Iconos SVG inline con `viewBox`, `fill="none"`, `stroke="currentColor"`,
   `aria-hidden="true"` y `focusable="false"`; si el control es solo icono,
   `aria-label` descriptivo.
9. Mantener 44 px de objetivo táctil y foco visible con `--focus` en
   `:focus-visible` en **todos** los estados.

---

## 4) Tipografía y jerarquía

### 4.1 Estado real

- `src/app/core/theme/fonts.scss` declara dos fuentes locales con licencia OFL
  en `public/fonts/`: **Roboto Mono** (variable) y **Bodoni Moda**, con sus
  licencias `OFL-*.txt`.
- **Hallazgo importante:** esas fuentes están declaradas pero **no son las
  activas**. `theme-tokens.scss` fija `--font-body` a una pila `Courier New`
  monoespaciada y `--font-display` a `system-ui`. `styles.scss` aplica esas
  variables a `body` y `h1, h2, h3`. La decisión de activar o no las OFL queda
  abierta al rediseño (no se cambia aquí).
- Tokens disponibles: `--font-size-xs` a `--font-size-3xl`,
  `--line-height-tight` / `-normal` / `-relaxed`, `--weight-regular` /
  `-medium` / `-bold`, `--heading-transform`, `--heading-tracking`.
- Inconsistencias detectadas: `src/app/features/aula/aula/aula.scss` fija el
  título de lección con valores en px (`font-size`, `line-height` y márgenes
  duros) en vez de tokens; `features/home/home.scss` da a los títulos de
  tarjeta `--font-size-md` (el más pequeño de la escala); `course-detail.scss`,
  `conversation-view.scss`, `legal.scss`, `site-footer.scss` y
  `classroom-nav.ts` definen tamaños ad-hoc (`1.2rem`, `1.1rem`, `0.72rem`,
  etc.) que compiten con la escala. `.lead` y varios bloques ya limitan el
  ancho de lectura a ~60 ch.

### 4.2 Encargo abierto

El agente de rediseño debe **proponer una escala coherente usando tokens**, sin
valores definitivos impuestos desde este documento:

| Nivel | Criterio a aplicar (propuesta abierta) |
| --- | --- |
| Display / `h1` | Un único nivel de máximo énfasis por página; `clamp()` en `rem`, no px sueltos |
| `h2` | Secciones de la página; mismo tratamiento en todas las features |
| `h3` | Subsecciones y títulos de unidad (tarjeta, bloque, comentario) |
| Cuerpo | `line-height` legible, contraste AA, ancho de línea ~60–70 ch para prosa |
| Small / caption | Etiquetas, metadatos, datos y ayudas; ~45 ch para titulares |
| `eyebrow` / badge | Tratamiento diferenciado y consistente, sin competir con `h2` |

- Definir `line-height` y `letter-spacing` **por nivel** con los tokens
  existentes (o añadir los que falten), nunca con valores literales por
  componente.
- Revisar cuándo usar cada fuente: la propuesta esperada es Bodoni Moda para
  titulares y Roboto Mono para etiquetas, datos e interfaz, **si se decide
  activarlas**; si no, documentar la pila del sistema y mantenerla coherente.
- Comprobar zoom al 200 % sin solapes ni pérdida de contenido; `clamp()`,
  `flex-wrap` y `rem` deben absorberlo.
- **No se fija aquí qué tamaño corresponde a cada nivel**: la propuesta
  concreta la entrega el agente de rediseño tras revisar §3.2.

---

## 5) Espaciado, márgenes y paddings (núcleo)

### 5.1 Tokens reales y propuesta de escala

`theme-tokens.scss` declara `--space-1 … --space-5` y los huecos de composición
`--section-gap`, `--card-pad`, `--card-gap`, `--grid-gap` (valores en el
archivo). La escala actual no es regular, por lo que se propone como **sistema
objetivo** una progresión coherente tipo `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`
expresada en `rem`, con `--space-1..N` como única fuente y `--section-gap`,
`--card-pad`, `--card-gap` y `--grid-gap` derivados de esa escala. La adopción
concreta la valida el agente de rediseño.

### 5.2 Reglas

1. **Orden de magnitud:** entre secciones > entre bloques > entre elementos >
   intra-elemento. Un mismo nivel debe usar el mismo token en toda la app.
2. `margin` para separar el componente de su exterior; `padding` para el aire
   interno. No mezclar ambos para el mismo fin.
3. Usar **`gap`** en flex/grid en lugar de márgenes entre hijos. Revisar
   `src/styles.scss` (`.button { margin: … }`),
   `features/aula/lesson-materials/lesson-materials.scss`
   (`li > * { margin-inline-end: … }`) y
   `features/mis-cursos/mis-cursos.scss` (`.course-card__actions`).
4. Reset de listas: `margin: 0`, `padding: 0`, `list-style: none` cuando la
   lista es navegación o colección visual; conservar marcadores solo en listas
   de lectura (`legal__list`, `feature-list`).
5. **No márgenes negativos** salvo el sangrado controlado del shell: revisar
   `.home` en `features/home/home.scss`, `.aula-layout` y `.video-stage` en
   `features/aula/aula/aula.scss`, documentando cada uno como excepción.
6. Contenedor `.inner` único: hoy conviven `.home-inner`, `.site-header__inner`
   y `.site-footer__inner` con anchos distintos (`--content-max-width` frente
   a `--max-width`). Unificar **max-width + padding-inline** compartidos por
   header y secciones.
7. `padding-block` por sección coherente: hay `clamp(1rem, 2.5vw, 2rem)`
   repetido en muchas features y valores duros en aula (`1.875rem`, `20px`,
   `48px`, `40px`). Sustituir por tokens.
8. Auditar `calc()`: son legítimos los usados para grosores de borde
   (`calc(var(--border-width) * 3)`) y para el sangrado controlado; evitar
   cálculos opacos encadenados entre tokens de espaciado (el ya corregido
   `calc(space-5 + space-4)` es el ejemplo a no repetir).

### 5.3 Situación → token recomendado

| Situación | Token recomendado |
| --- | --- |
| Separación entre secciones de una página | `--section-gap` |
| Aire interno de tarjeta o panel | `--card-pad` |
| Hueco entre elementos dentro de una tarjeta | `--card-gap` |
| Hueco entre tarjetas de una rejilla | `--grid-gap` |
| Hueco pequeño entre etiqueta y campo | `--space-1` / `--space-2` |
| Hueco entre control y su texto de ayuda | `--space-2` / `--space-3` |
| Margen inferior de párrafo | `--space-3` / `--space-4` |
| Sangrado horizontal del shell | `--content-max-width` + padding-inline compartido |
| Objetivo táctil y foco | `--tap-min`, `--focus-ring` |

---

## 6) Componentes a revisar (inventario técnico por archivo)

Prioridades: **P0** botones y hovers unificados + espaciado; **P1** jerarquía
tipográfica; **P2** imágenes y microdetalles.

| Área | Archivos | Problemas típicos detectados | Prioridad |
| --- | --- | --- | --- |
| Shell / cabecera | `app.html`, `app.scss`, `styles.scss` | Múltiples bases de botón (`.button`, `.link-button`, `.hdr-link`, `.session-actions a`); `.button` ghost en `theme-components.scss` vs relleno en `styles.scss`; hover con `filter: brightness` | P0 |
| Portada | `features/home/home.html`, `home.scss` | `.home-button--primary` con hover propio, `.home-card:hover .home-button--primary` con otro filtro; tarjetas con/sin borde; imagen a 5 rem / 3,5 rem; `span` con apariencia de CTA | P0, P1, P2 |
| Catálogo y ficha | `features/cursos/**` | `.retry` sin estilo; `app-checkout-button .buy` con base propia; `h2` con tres `clamp()` distintos; `fact-card` y `preview-card` con géneros visuales diferentes | P0, P1 |
| Biblioteca y favoritos | `features/mis-cursos/**`, `features/favoritos/**` | `.action` duplicado con variaciones entre ambos archivos; `.action:hover` cambia a `--admin-accent-strong`; barra de progreso con dos implementaciones; anchos de tarjeta duros (`375px`, `330px`) | P0, P2 |
| Aula | `features/aula/**` | `.progress-button`, `.video-button`, `.favorite-toggle`, `.download-button` con bases distintas; hover con literal de color heredado; título en px; `min-height: 6.5rem`; sangrados calculados | P0, P1 |
| Comentarios | `features/comentarios/**` | `.comments-button`, `.reply-button`, `.delete-button` con tres tratamientos; `filter: brightness(.92)`; sangrado de respuestas por profundidad con valores distintos | P0, P1 |
| Foro | `features/foro/**` | `.forum-button` redefinido en dos archivos; `.forum-link` comparte base pero con género distinto; `h2` de tarjeta frente a `h2` de formulario; badges con fondos diferentes | P0, P1 |
| Perfil y legal | `features/perfil/**`, `features/legal/**` | Botones sin variante (`.legal__consent-button`, botones de perfil); fallbacks de color heredados; tamaños ad-hoc; mismo botón con hover distinto | P0, P1 |
| Admin | `features/admin/**` | `admin.scss`, `course-editor.scss`, `structure.scss`, `lesson-video.scss`, `preview.scss` con reglas de botón propias; `lesson-video.scss` usa literales de color heredados y `36px` en toasts; DnD e inspector deben conservarse | P0, P1 |
| Compartidos | `shared/course-card/**`, `site-footer/**`, `cookie-banner/**`, `skeleton/**` | `.card__view`, `.site-footer__legal-link`, `.cookie-banner__button` (con hover a literal heredado), `.buy`; dos clases de texto oculto; `.cookie-banner__button--primary:hover` cambia de color | P0, P2 |

El detalle visual de secciones, cards y hovers se desarrolla en §10.

---

## 7) Sistema de botones (P0)

### 7.1 Tres variantes con tokens

| Variante | Definición (tokens, sin valores literales) | Uso |
| --- | --- | --- |
| **Primary** | Fondo `--accent-strong` (o `--accent` mientras no se decida el tercer color), texto `--accent-strong-ink`/`--accent-ink`. **Sin hover que cambie de color**: decisión del usuario. El feedback visual se reserva a foco, active y disabled | Una CTA principal por vista |
| **Secondary** | Borde `--accent`, fondo transparente/`--surface`, texto `--accent`; hover a acento con `--admin-surface-hover` | Acciones alternativas, «Ver curso», «Reintentar» |
| **Terciario / ghost** | Solo texto, sin borde ni fondo, sin `text-decoration` en ningún estado | «Responder», «Eliminar», «Cancelar», «Personalizar» |

Reglas comunes: `min-height: var(--tap-min)` (44 px), mismo padding y
`font-size` con `--font-size-md`, `font-weight` de la escala, `line-height`
coherente, foco con `--focus` en `:focus-visible`, `text-decoration: none` en
todos los estados (ya lo hace `styles.scss`), iconos con el mismo hueco y
`aria-hidden`. Disabled legible con `--admin-disabled-*`, sin `opacity` que
reduce contraste.

### 7.2 Mapeo de los botones actuales

| Archivo | Clase actual | Variante destino |
| --- | --- | --- |
| `features/home/home.scss` | `.home-button--primary` | Primary (sin hover de color) |
| `features/home/home.scss` | `.home-button--secondary` | Secondary |
| `shared/course-card/course-card.scss` | `.card__view` | Secondary |
| `features/cursos/cursos.scss` | `.retry` | Secondary |
| `features/mis-cursos/mis-cursos.scss`, `features/favoritos/favoritos.scss` | `.action--primary` / `.action--secondary` | Primary / Secondary |
| `features/aula/aula/aula.scss` | `.progress-button`, `.video-button` | Secondary |
| `features/aula/lesson-materials/lesson-materials.scss` | `.download-button` | Secondary |
| `features/comentarios/conversation-view.scss` | `.comments-button`, `.reply-button`, `.delete-button` | Primary, Terciario, Terciario (con `--danger` para Eliminar) |
| `features/foro/forum-categories.scss`, `forum-threads.scss` | `.forum-button`, `.forum-link` | Primary, Secondary |
| `features/legal/legal.scss` | `.legal__consent-button` | Primary |
| `shared/cookie-banner/cookie-banner.scss` | `.cookie-banner__button--primary`, `--quiet` | Primary, Terciario |
| `core/checkout/checkout-button.scss` | `.buy` | Secondary (o Primary en la ficha, con criterio de una CTA por vista) |
| `features/admin/**`, `styles.scss` | `.button`, botones sin clase, `a[download]` | Primary para guardar/enviar, Secondary para acciones, Terciario para cancelar |

**Controles de icono:** la estrella de favorito, el progreso y las flechas del
aula, y los controles de reordenación del admin no entran en esta escala de
tres botones, pero **sí comparten el hueco táctil de 44 px**, foco visible y
`aria-label`/`aria-pressed` cuando corresponda.

---

## 8) Imágenes

- Tamaños reales: cubierta de curso en portada a `height: 5rem` en escritorio y
  `3,5rem` en móvil (`features/home/home.scss`); visual de tarjeta de catálogo
  `clamp(7rem, 16vw, 10rem)` como bloque CSS (`shared/course-card`); visual de
  biblioteca con `aspect-ratio: 16/9` y formas CSS (`features/mis-cursos`).
- Assets propios verificados: `public/images/curso-cover.png` y
  `public/images/profesor-placeholder.svg`; fuentes OFL en `public/fonts/`. No
  hay fotografías de terceros; no añadir sin licencia.
- Reglas: `object-fit: cover` en imágenes de cubierta; atributos `width` y
  `height` para evitar CLS (ya presentes en las imágenes de portada);
  `loading="lazy"` salvo la imagen protagonista; `alt` descriptivo cuando la
  imagen aporta información y `aria-hidden="true"`/`alt=""` cuando es
  decorativa (ya aplicado en cubiertas); `<figure>/<figcaption>` para la foto
  del profesor cuando tenga sentido.
- **Proporción:** la imagen nunca debe dominar la tarjeta; el texto y la
  jerarquía mandan. Revisar el equilibrio entre visual, título, resumen y CTA en
  portada, catálogo y biblioteca. La foto real del profesor está pendiente
  (D13): no inventarla.

---

## 9) Accesibilidad y responsive

- Contraste **AA** en todos los estados y con el tercer color cuando se elija;
  el color nunca es el único indicador (forma, texto o icono).
- `prefers-reduced-motion: reduce` desactiva transiciones, `scroll-behavior:
  smooth` y el barrido del esqueleto; ya está en `styles.scss` y en varios
  componentes, verificar de forma global.
- Foco visible de **3 px** con `--focus` en `:focus-visible`. Hay una
  discrepancia a resolver: el token `--focus-ring` declara 2 px mientras las
  reglas reales usan 3 px; unificar.
- Objetivos táctiles de **44 px** (`--tap-min`) con separación entre vecinos.
- Sin scroll horizontal a **320 px** (hay reglas `@media (max-width: 20rem)`
   en `app.scss`, `styles.scss`, `home.scss`, `legal.scss`, etc.); verificar
   también a 200 % de zoom.
- `lang="es"` en `src/index.html`; teclado completo, incluidos menú de usuario,
  cajón del aula, pestañas del inspector y DnD con alternativa de botones
  «Subir/Bajar».
- Consentimiento y analítica intactos; sin dark mode; sin SSR; sin promesas de
  protección de vídeo ni capacidades no verificadas.

---

## 10) Estilo general, cards y hovers — encargo abierto

### 10.1 Matiz del usuario

El **estilo global le gusta**: tokens, tema Línea precisa y sencillez general
se **conservan**. Lo que considera *muy mejorable* es el estilo de las
**secciones específicas** y sus componentes: cards, listas, bloques, paneles,
hovers y la jerarquía interna de cada sección. El encargo es **mejorar el
acabado sin perder la sencillez ni recargar la interfaz**.

### 10.2 Principios (no un estilo definitivo)

- Coherencia: una sola base de botón, feedback, lista y panel; antes de añadir
  un adorno, reutilizar un patrón existente.
- Sencillez: espaciado y línea fina antes que cajas; una card solo cuando la
  unidad se compara en cuadrícula, lista/tabla cuando se recorre en secuencia
  (criterio ya documentado en `docs/sistema-visual.md` §7).
- Contraste y foco visibles siempre; `text-decoration: none` en acciones; hover
  suave y **sin cambio de color en el primary**.
- `prefers-reduced-motion` respetado; un solo elemento primary por vista.
- **No se prescribe aquí ningún estilo definitivo ni valor concreto**: la
  propuesta la entrega el agente de rediseño.

### 10.3 Inventario por sección (qué mirar, sin imponer solución)

| Sección | Archivos reales | Síntomas típicos a revisar |
| --- | --- | --- |
| Portada | `features/home/**` (`home.html`, `home.scss`) | Card con borde, sombra y hover propios frente al resto; CTAs falsos; imagen pequeña frente al texto; divisor y bloques con ritmos distintos |
| Catálogo y ficha | `features/cursos/**` (`cursos.html/.scss`, `course-detail/**`) | Cards con visual CSS frente a tarjetas reales; `h2` con tamaños dispares; `fact-card`, `preview-card` y `access-status` con géneros distintos; hovers dispares |
| Biblioteca y favoritos | `features/mis-cursos/**`, `features/favoritos/**` | Tarjetas con anchos duros; dos barras de progreso; `.action` duplicado; hover de acento distinto al de catálogo; listas con/sin separador |
| Aula | `features/aula/**` (`aula/**`, `classroom-nav.ts`, `lesson-materials/**`) | Índice con hover propio y literal heredado; barra de acciones sobre el vídeo con botones dispares; título gigante en px; materiales con botón propio; sangrados calculados |
| Comentarios | `features/comentarios/**` | Tres estilos de botón; hover con filtro; sangrado por profundidad distinto en móvil; badges con fondo propio |
| Foro | `features/foro/**` | Tarjetas que a veces son caja y a veces solo línea; badge de administrador con género distinto al de comentarios; `h2` compitiendo; hover de enlaces vs botones |
| Perfil y legal | `features/perfil/**`, `features/legal/**` | Botones sin variante; avisos con literales de color heredados; tamaños ad-hoc; índice legal con otro ritmo de espaciado |
| Admin | `features/admin/**` (incl. `course-editor/`, `structure/`, `lesson-video/`, `preview/`) | Muchas bases de botón locales; paneles con borde/sombra/fondo dispares; literal de color heredado en `lesson-video.scss`; mantener DnD, inspector y pestañas funcionales |
| Shell y compartidos | `app.html`, `app.scss`, `shared/**` | Cabecera con varias bases de enlace; pie con `<h2>` de grupo; banner de cookies con hover propio; esqueletos y tarjeta de curso como referencia de coherencia |

Para cada sección el agente debe revisar: **bordes/fondo/radio/sombra** de las
cards y cuándo corresponde card frente a espacio+línea; **hovers** coherentes
entre componentes; **espaciados** desiguales; **títulos que compiten** entre sí;
e **imágenes desproporcionadas** respecto al texto.

---

## 11) Plan de ejecución sugerido

1. **Inventario y tokens base:** unificar `.inner`, escala `--space-*`, foco y
   `--tap-min`; migrar literales de color a tokens. *Criterio:* no quedan
   colores ni espacios literales nuevos fuera del archivo de tokens; `git diff
   --check` limpio.
2. **Sistema de botones (P0):** tres variantes, un primary por vista, sin hover
   de color en primary. *Criterio:* todas las clases listadas en §7.2 mapean a
   una variante; ningún `text-decoration` en acciones; 44 px y foco en todas.
3. **HTML semántico:** revisar la lista de §3.2 con los criterios de §3.1.
   *Criterio:* un `h1` por página, sin saltos, `aria-labelledby` válidos,
   enlaces estirados en vez de `span`-CTA.
4. **Jerarquía y tipografía:** proponer escala con tokens (§4.2). *Criterio:* sin
   px sueltos en titulares; ancho de lectura ~60–70 ch; zoom 200 % sin solapes.
5. **Espaciado y cards:** aplicar §5 y §10.3. *Criterio:* misma jerarquía de
   espaciado entre secciones, bloques y elementos; cards coherentes; lista vs
   card según criterio de §10.2.
6. **Imágenes y microdetalles:** §8. *Criterio:* `object-fit`, `width/height`,
   `loading`, `alt`; imagen no dominante.
7. **Accesibilidad y responsive:** §9. *Criterio:* AA, reduced-motion, 320 px
   sin scroll horizontal, teclado completo.
8. **Verificación:** `npm test`, `npm run test:functions`, `npm run test:sql`,
   `npm run build` y `git diff --check`; capturas en móvil y escritorio de
   portada, catálogo, ficha, biblioteca, aula, foro y admin.

### Decisiones abiertas

- **Tercer color de acento:** a elegir por el agente de rediseño (rol y
  requisitos en §2.2). Este documento no propone valores ni ratios.
- **Jerarquía visual y tipográfica de cada página:** a revisar y proponer por el
  agente de rediseño (criterios y archivos en §HTML semántico / §Tipografía).
- **Estilo:** global **a conservar** (le gusta); estilo de secciones, cards y
  hovers: **mejora prioritaria** a proponer por el agente de rediseño,
  manteniendo la sencillez actual (ver §Estilo general…).
- **Packs y ofertas:** si son solo visuales o si finalmente son comprables,
  decisión pendiente del promotor (no se inventa).
- **Foto real del profesor:** pendiente de datos del promotor (D13); no se
  inventa ni se publica la de muestra como definitiva.
- **Título:** «Academia de Guitarra» ya está decidido y aplicado en
  `src/index.html` y en las rutas; **no reabrir**.

---

## 12) Apéndice

### Documentos existentes (referencia)

- `AGENTS.md` — reglas técnicas, de producto y de trabajo.
- `docs/sistema-visual.md` — sistema visual actual, cuándo card y cuándo no,
  estados y esqueletos.
- `docs/decisiones-producto.md` — decisiones confirmadas y pendientes.
- `docs/pendientes-y-roadmap.md` — estado funcional, decisiones D1–D16 y orden
  de trabajo.
- `docs/arquitectura-datos.md`, `docs/checkout-estado.md`,
  `docs/pedidos-checkout.md`, `docs/confirmacion-pago.md`,
  `docs/webhook-estado.md`, `docs/legal-y-footer.md`,
  `docs/referencia-aula.md`, `docs/analitica-y-consentimiento.md`,
  `docs/video-estado.md`, `docs/video-admin-estado.md`,
  `docs/video-token-estado.md`, `docs/video-upload-estado.md`,
  `docs/packs-y-ofertas-stripe.md`, `docs/precio-prueba-stripe.md`.
- No leer ni publicar `docs/plan-maestro.md` ni `docs/privado/`.

### Comandos de verificación

```
npm test
npm run test:functions
npm run test:sql
npm run build
git diff --check
```

### Recordatorio final

No tocar `angular.json` ni `opencode.jsonc`. No instalar nada ni cambiar el
CLI global. No hacer commits ni push sin autorización; este documento es solo
un encargo y su ejecución corresponde al agente de rediseño. Sin secretos, datos
personales ni el plan privado en ningún archivo del repositorio.
