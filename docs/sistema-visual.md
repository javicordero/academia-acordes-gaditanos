# Sistema visual de la academia (guía técnica provisional)

Documento técnico público. Describe **cómo se organiza lo visual ya existente** y
cómo probarlo; no cierra la identidad definitiva ni decide pendientes del
producto (nombre, foto, bio, testimonios, precios ni diseño final de la
portada). La fuente de verdad de los valores es `src/app/core/theme/`
(`theme-tokens.scss`, `theme.service.ts`, `fonts.scss`, `theme-components.scss`)
y `src/styles.scss`. Si este documento y el código discrepasen, manda el código.

> **Nota de título pendiente (no aplicado):** se propone como título para el
> subdominio «Academia de Guitarra · De Acordes Gaditanos». El título actual de
> `src/index.html` sigue siendo «Academia Acordes Gaditanos» y **no se cambia
> hasta confirmación**. Es una propuesta, no una decisión cerrada.

## 1. Principios

- **Token-first:** color, tipografía, espaciado, radio, sombra y borde se
  consumen como variables CSS (`--bg`, `--accent`, `--card-pad`, …). Un
  componente no fija valores de marca: los hereda del tema activo para que el
  cambio sea instantáneo y no dependa de reglas por tema.
- **Accesibilidad primero:** foco visible siempre, contraste suficiente,
  objetivos táctiles grandes, estructura semántica y `lang="es"`. Si una
  decisión estética empeora la accesibilidad, gana la accesibilidad.
- **Consistencia antes que decoración:** una sola base de botón, feedback,
  lista y panel para toda la app; antes de añadir un adorno, se reutiliza un
  patrón existente.
- **Sin copiar marcas:** la inspiración es de patrones y métodos, nunca de
  paletas, tipografías propietarias, logotipos, textos ni assets de terceros
  (ver §10 y §12).

## 2. Los dieciocho temas claros

El selector (`theme.service.ts`, `THEME_IDS` y `THEME_OPTIONS`) ofrece
**dieciocho** ids estables con la etiqueta visible que se indica abajo;
`creator` («Creador») es el predeterminado (`DEFAULT_THEME_ID`). Cada bloque
declara **los mismos nombres de token**: cambian los valores, no el contrato.
No hay detección claro/oscuro del sistema: hay una elección explícita
persistida. **Los dieciocho temas son claros**: todos declaran
`color-scheme: light`, superficies claras y texto oscuro con acentos vivos.

| id | etiqueta (selector) | Sensación que busca |
| --- | --- | --- |
| `creator` | Creador | Superficie clara cálida, acento cálido vivo, cercanía editorial; el que más gustó al usuario. Predeterminado. |
| `flamenco` | Flamenco editorial | Crema cálido y granada: aire, calidez y carácter. |
| `conservatorio` | Conservatorio | Azul pizarra limpio y frío; rigor, claridad institucional. |
| `escuela` | Escuela clásica | Academia formal, serif, borde marcado y acento violeta contenido. |
| `editorial` | Editorial de bolsillo | Papel, serif de lectura, aire de página y sin sombra de tarjeta. |
| `cuaderno` | Cuaderno del profesor | Cuaderno verde, monoespacio, líneas punteadas y ritmo compacto. |
| `minimal` | Minimal técnico | Neutral y sobrio, contraste suave y cuadrícula discreta. |
| `atelier` | Atelier boutique | Elegancia contenida, tipografía de contraste marcado y mucho aire. |
| `taller` | Taller artesanal | Calidez de materiales, radio amplio y ritmo despejado. |
| `estudio` | Estudio de grabación | Consola técnica clara, realce interior y rejillas compactas. |
| `impacto` | Impacto AG | Jerarquía muy fuerte: titulares grandes, una CTA dominante y mucho espacio. |
| `linea` | Línea precisa | Medida y precisión: listas antes que tarjetas, acento reservado a activo/foco. |
| `brutalista` | Brutalista AG | Carácter crudo y directo; identidad propia, no copia de la web principal. |
| `energia` | Energía en pista | Superficie clara y acento cálido intenso, mayúsculas y ritmo eléctrico. |
| `jugueton` | Juguetón | Cercano y lúdico, radios muy redondeados y sin divisores de lista. |
| `glass` | Cristal sereno | Superficies translúcidas claras, radios amplios y luz difusa. |
| `serio` | Serio corporativo | Azul institucional sobrio, esquinas vivas y densidad compacta. |
| `prensa` | Prensa cultural | Papel de diario, serif de titular, columna estrecha y reglas marcadas. |

**No existe un tema «Nocturno» ni uno «Alto contraste»**: ninguno de los dos
es una opción actual. El **contraste accesible AA está garantizado en los
dieciocho temas**, no solo en uno: cada paleta cumple ≥ 4,5:1 en texto y ≥ 3:1
en controles y bordes de interés, con `--accent-ink` legible sobre `--accent` y
pares de feedback propios (§3). La accesibilidad es un requisito transversal
del sistema, no una variante que se pueda elegir o perder. Un tema oscuro, si
llega, será una **decisión futura** separada: hoy no se ofrece ni se simula.

Las etiquetas son nombres internos de opción del selector; los valores de
cada tema son propios y no reproducen paletas, tipografías ni assets de marca
(§10 y §12).

### Diferencias entre temas

Además del color, **cada tema varía al menos siete dimensiones visibles**; en
esta tabla se documentan once, con los valores reales declarados en
`theme-tokens.scss`. Los espaciados se dan como
`--section-gap / --card-pad` en `rem`; `S/B` es sombra de tarjeta
(`--shadow-card`) y grosor de borde (`--border-width`); `Titulares` recoge
`--heading-transform / --heading-tracking`.

| id | Fuente (cuerpo / display) | Espaciado | Radio `--radius-md` | Sombra / borde | Densidad | Titulares | Botón | Divisor lista | Superficie tarjeta | Ancho máx. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `creator` | Roboto Mono / Bodoni Moda | 2 / 1,25 | 12 px | suave teñida / 1 px | medium | none / −0,02em | solid | 1 px | `#fffdf7` | 68 rem |
| `flamenco` | Georgia / Palatino Linotype | 2,75 / 1,75 | 10 px | cálida sutil / 1 px | airy | capitalize / +0,01em | outline | 1 px | `#fffaf1` | 72 rem |
| `conservatorio` | system-ui / system-ui | 1,5 / 1 | 5 px | casi plana / 2 px | compact | none / +0,04em | solid | 2 px | `#ffffff` | 64 rem |
| `escuela` | Times New Roman / Palatino Linotype | 2,6 / 1,55 | 12 px | violeta / 2 px | medium | none / +0,05em | solid | 2 px | `#fffdf5` | 66 rem |
| `editorial` | Georgia / Times New Roman | 2,25 / 1,5 | 2 px | sin sombra / 1 px | airy | capitalize / −0,03em | ghost | 1 px | `#ffffff` | 62 rem |
| `cuaderno` | Courier New / Georgia | 1,9 / 1 | 4 px | línea inferior / 1 px | compact | none / +0,02em | soft | 1 px discontinuo | `#fffef8` | 60 rem |
| `minimal` | system-ui / Helvetica Neue | 2,5 / 1,25 | 6 px | muy sutil / 1 px | medium | none / −0,01em | soft | 1 px | `#ffffff` | 76 rem |
| `atelier` | Georgia / Didot | 3,2 / 1,7 | 18 px | profunda / 1 px | spacious | none / +0,07em | outline | 1 px | `#fffafc` | 64 rem |
| `taller` | Palatino Linotype / Georgia | 2,5 / 1,6 | 16 px | cálida / 2 px | airy | none / +0,02em | soft | 1 px discontinuo | `#fbf3e4` | 70 rem |
| `estudio` | Courier New / Trebuchet MS | 2 / 1,2 | 10 px | realce interior / 1 px | medium | none / +0,08em | outline | 1 px | `#ffffff` | 74 rem |
| `impacto` | Arial Narrow / Arial Black | 4 / 2,5 | 4 px | sin sombra / 1 px | spacious | uppercase / −0,05em | solid | none | `#ffffff` | 78 rem |
| `linea` | Courier New / system-ui | 1,75 / 0,9 | 5 px | mínima / 1 px | compact | none / +0,03em | ghost | 1 px | `#ffffff` | 72 rem |
| `brutalista` | Arial Black / Courier New | 1,25 / 0,875 | 0 px | dura sin difuminar / 4 px | compact | uppercase / +0,06em | outline | 4 px | `#ffffff` | 66 rem |
| `energia` | Arial Black / Trebuchet MS | 2 / 1,35 | 4 px | de color / 2 px | medium | uppercase / +0,1em | solid | 2 px | `#ffffff` | 72 rem |
| `jugueton` | Trebuchet MS / Comic Sans MS | 2,6 / 1,8 | 22 px | escalonada / 2 px | spacious | capitalize / +0,03em | soft | none | `#ffffff` | 68 rem |
| `glass` | system-ui / Helvetica Neue | 3 / 1,6 | 20 px | difusa / 1 px | airy | none / +0,01em | soft | 1 px translúcido | translúcida | 74 rem |
| `serio` | system-ui / Arial | 1,8 / 1,1 | 0 px | sin sombra / 1 px | compact | none / +0,06em | solid | 1 px | `#ffffff` | 70 rem |
| `prensa` | Georgia / Times New Roman | 2,8 / 1,5 | 0 px | sin sombra / 1 px | airy | capitalize / −0,04em | ghost | 2 px | `#fffdf8` | 60 rem |

La forma de lista y de tarjeta también cambia con `--card-display`
(`block`, `stack` o `grid`) y `--card-surface`; la regla de cuándo usar card o
lista del §8 no depende del tema. Las fuentes son pilas locales o del sistema
sin descargar: las dos fuentes OFL versionadas siguen siendo la base y la
referencia (§4).

## 3. Color

Los roles semánticos son el contrato; el tema decide sus valores:

- `--bg` fondo de página; `--surface` superficie elevada (tarjeta, panel);
  `--ink` texto principal; `--muted` texto secundario.
- `--accent` acción y énfasis; `--accent-ink` texto que va **sobre** el acento
  (debe contrastar con él en los dieciocho temas).
- `--border` divisores y contornos; `--focus` anillo de foco visible.
- `--success`, `--warning`, `--danger`, `--info` (estos dos últimos como rol
  semántico cuando se necesiten; hoy el panel usa `--admin-success`,
  `--admin-warn`, `--admin-danger` y sus superficies/textos asociados).
- El panel de administración deriva de ahí la familia `--admin-*` (`surface`,
  `surface-soft`, `surface-hover`, `field-bg`, `border`, `border-strong`,
  `text`, `text-muted`, `accent`, `accent-strong`, `accent-ink`, `focus`,
  estados disabled/success/warn/danger). No se crea una paleta paralela.

Reglas:

- Texto **≥ 4,5:1** contra su fondo; controles y bordes de interés **≥ 3:1**.
  Estos mínimos AA se verifican **en todos los temas**: no hay un tema
  «Alto contraste» ni oscuro que los garantice por separado ni una opción que
  pueda relajarlos. Ante duda, se corrige la paleta del tema afectado.
- **El color nunca es el único indicador:** todo estado lleva además forma,
  texto o icono (check, «✓», `aria-checked`, mensaje escrito).
- El anillo de foco usa `--focus` en `:focus-visible` (3 px por defecto, con
  `outline-offset`; `--focus-ring` varía por tema), nunca se suprime sin
  alternativa visible.
- `meta[name="theme-color"]` se actualiza desde `THEME_META_COLORS` al cambiar
  de tema; es coherente con `--bg`, no un valor independiente.

## 4. Tipografía

- **UI y cuerpo (base y `creator`):** `Roboto Mono` (`--font-body`), variable
  100–700, archivo local `public/fonts/roboto-mono-latin.woff2`, licencia OFL
  incluida.
- **Display y wordmark (base y `creator`):** `Bodoni Moda` (`--font-display`),
  400, archivo local `public/fonts/bodoni-moda-latin.woff2`, licencia OFL
  incluida. Se aplica a `h1, h2, h3`. Ambas pilas tienen respaldo del sistema.
- Los demás temas redefinen `--font-body` y `--font-display` con **stacks de
  fuentes del sistema o ya instaladas** (§2), sin descargar recursos ni usar
  tipografías propietarias de terceros. La escala, los pesos y
  `--line-height-*` se heredan: cambia la pila, no el contrato de tamaños.
- **Escala en `rem`** para respetar la preferencia de tamaño del usuario.
  Cuerpo `line-height: 1.6`; titulares `1.15`. `h1` usa
  `clamp(2.1rem, 5vw, 3.25rem)` y `h2` `clamp(1.35rem, 2.5vw, 1.7rem)`;
  el texto de apoyo (`.lead`) se limita a ~60 ch y el ancho de contenido a
  `--content-max-width`.
- **Pesos:** 600/650/700 para acciones y etiquetas; 400 para lectura. No se
  abusa de las negritas para simular jerarquía.
- **Zoom al 200 %:** sin pérdida de contenido ni solapes; los `clamp()`, el
  `flex-wrap` y las unidades `rem` deben absorberlo. Probar también con
  texto alargado y `overflow-wrap: anywhere` en títulos de curso.

## 5. Espaciado y geometría

- Base de **4 px** con ritmo preferente de **8 px**. Un `rem = 16 px`:
  `--space-1` (4 px), `--space-2` (8 px), `--space-3` (14 px),
  `--space-4` (20 px), `--space-5` (32 px). Cada tema puede apartarse de ese
  ritmo en escalas densas deliberadas (p. ej. conservatorio o brutalista);
  documentar la excepción en el bloque del tema, no en el componente.
- Huecos de composición: `--section-gap` entre bloques de página, `--card-pad`
  y `--card-gap` dentro de tarjetas, `--grid-gap` en rejillas.
- Geometría: `--radius-sm` / `--radius-md` / `--radius-lg`, `--shadow-card` /
  `--shadow-raised`, `--border-width` y `--content-max-width`. `--radius` es
  el comodín heredado para controles.
- Estos tokens son de **declaración**: los consumen los componentes que los
  necesitan (tarjeta de curso, esqueleto, panel). No se aplican al shell para
  no alterar la altura de la cabecera ni romper el menú móvil.
- Si un componente necesita una medida nueva, se añade como variable local
  documentada y se migra a token cuando más de un componente la comparta.

## 6. Iconografía

- **SVG inline**, con `viewBox`, `fill="none"`, `stroke="currentColor"` y
  `stroke-width` ~1,6–2 para heredar color y tamaño del tema. Ejemplo de
  referencia: el icono del selector de tema (`viewBox="0 0 20 20"`, trazo
  1,6; `--stroke-width` varía por tema).
- **Tamaños:** 16, 20, 24 y 32 px. 16 para marcas dentro de texto, 20–24 para
  acciones, 32 para hitos vacíos. No se escalan de forma arbitraria.
- **Icono decorativo:** `aria-hidden="true"` y `focusable="false"`.
  **Icono solo:** el control lleva `aria-label` descriptivo («Cambiar tema»,
  «Completar lección»). **Icono + texto:** el texto nombra la acción y el
  icono solo la refuerza.
- **Objetivos táctiles:** mínimo 44 px (preferible 44–48 px) de alto y ancho,
  con `min-height: 44px` en enlaces, botones y campos; el espacio entre
  objetivos vecinos evita activaciones accidentales.
- No se importan iconos de librerías de terceros con estilo propio: se dibujan
  en el proyecto o se usan formas del dominio público con licencia revisada.

## 7. Componentes y patrones

- **Botón primario:** una CTA principal por vista; relleno `--accent` con
  texto `--accent-ink` (base `.button`, `button[type=submit]`).
  **Secundario:** superficie `--admin-surface`, borde y texto de acento.
  **Terciario:** `.link-button`, sin borde, subrayado, para acciones de bajo
  peso. Todos comparten `min-height: 44px`, `font: inherit` y el mismo patrón
  de hover/active/disabled.
- **Badge:** Etiqueta corta de estado o nivel; borde de 1 px, radio
  `--radius-sm`, texto en `--muted` o `--accent`. Siempre acompañada de texto
  legible; el color refuerza, no sustituye.
- **Feedback / alert / toast:** una sola base con borde izquierdo de 4 px y
  variantes `--success`, `--warning`, `--error`/`--danger`. `role="alert"` para
  mensajes que interrumpen; `aria-live` para avisos no urgentes (toast). El
  mensaje dice qué pasó y qué hacer, no solo «Error».
- **Listas:** filas con separador de 1 px (`--border-width`) y padding
  `--space-*`. Es la forma por defecto de temarios, progreso y administración.
- **Tablas:** cabecera con `<th scope="col">`, celdas alineadas, filas
  alternas solo si ayudan a seguir la lectura; sin colores de estado aislados.
- **Paneles:** superficie `--surface`, borde `--border`, radio `--radius-md`,
  padding `--card-pad`. Para lectura larga, panel de lectura con ancho de
  medida, no tarjetas encadenadas.

## 8. Cuándo CARD y cuándo NO CARD

**SÍ card** (tarjeta de curso en rejilla): imagen/visual + metadatos + título +
resumen + CTA. Es una unidad independiente que se compara lado a lado con
otras en `cursos` y `mis-cursos` (`shared/course-card`). Usa `--card-pad`,
`--card-gap`, `--grid-gap`, `--radius-md` y `--shadow-card`.

**NO card:**

- Temario y progreso, lista de lecciones e índice del aula → **lista con
  separadores de 1 px**, fila activa marcada con forma y texto.
- Filas de administración (cursos, bloques, materiales, comentarios) →
  **lista o tabla**, no una tarjeta por fila decorada.
- Filtros, controles de formulario y texto corrido → **panel de lectura** o
  grupo de campos, sin burbujas apiladas.
- Retorno y confirmación de pago / checkout → **panel sobrio** con el estado
  por escrito; nunca una card que parezca una oferta comercial.

Regla rápida: si la unidad se «compara en cuadrícula», card; si se «recorre en
secuencia», lista o tabla.

## 9. Estados

| Estado | Forma y color | Texto / semántica |
| --- | --- | --- |
| hover | fondo `--admin-surface-hover`, borde `--accent-strong` | Solo en controles interactivos; no sustituye al foco |
| focus | anillo `--focus` en `:focus-visible` (`--focus-ring`, 2–3 px según tema) | Siempre visible con teclado |
| active | mismo realce que hover + desplazamiento de 1 px (se anula con reduced-motion) | Confirmación física de pulsación |
| disabled | borde `--admin-disabled-border`, fondo y texto disabled, `cursor: not-allowed`, `opacity: 1` | La etiqueta sigue legible; se indica por qué si procede |
| selected | borde/relleno de acento y marca visible (✓, `aria-checked`) | El estado se nombra, no solo se colorea |
| loading | esqueleto con `--muted`/`--surface` y aviso `sr-only` | Solo mientras cargan datos reales (listas, índice, tarjetas) |
| error | borde izquierdo y superficie `--danger`, icono + mensaje | Qué falló y cómo corregirlo |

- **Un solo primario por vista.** Si hay dos acciones igual de fuertes, se
  decide cuál manda; las demás pasan a secundario o terciario.
- **Reduced-motion:** `prefers-reduced-motion: reduce` desactiva transiciones,
  `scroll-behavior: smooth` y el barrido del esqueleto.

### Esqueletos de carga (`SkeletonBlock`)

`src/app/shared/skeleton/` expone `app-skeleton` (`SkeletonBlock`), un
componente **presentacional**: no consulta datos, no guarda estado y no
interactúa. Se coloca dentro de `@if (loading())` en cada página. Variantes
cerradas (`SKELETON_VARIANTS`): `text`, `title`, `card`, `list`, `video` e
`index`; `lines` (1–8, por defecto 3) solo afecta a `text`. Su geometría y
color vienen de tokens de tema, así que reacciona a los dieciocho temas sin
reglas por tema.

- **Cuándo usarlos:** esperas de datos reales de duración incierta —listas,
  índice del aula, tarjetas de catálogo, titulares o el hueco del vídeo—,
  reservando la misma geometría que el contenido final para evitar saltos.
- **Cuándo NO usarlos:** **pagos/checkout, subidas y confirmaciones**. Ahí se
  muestra el estado real por escrito («Procesando…», «Subido», «Error») con
  `role="status"` / `role="alert"` y resultado verificable; un esqueleto
  sugeriría una carga inocua donde hay una operación en curso.
- **Accesibilidad:** las formas son decorativas (`aria-hidden="true"`) y un
  único aviso `.sr-only` con `role="status"` y `aria-atomic="true"` anuncia la
  carga (`ariaLabel`, por defecto «Cargando contenido…»), sin repetir un aviso
  por forma. El barrido **solo** se genera bajo
  `@media (prefers-reduced-motion: no-preference)`; con reducción de movimiento
  quedan bloques estáticos. El contraste de las formas se verifica en los
  dieciocho temas.

## 10. Fuentes externas consultadas (solo patrones, no copia)

Referencias públicas de patrones y métodos. Pueden cambiar de URL; se citan
como orientación, nunca como fuente de assets:

- Material 3 — <https://m3.material.io/> (tokens, estados, accesibilidad).
- Apple Human Interface Guidelines — <https://developer.apple.com/design/human-interface-guidelines/> (foco, objetivos táctiles, jerarquía).
- Stripe Design / Docs — <https://stripe.com/design> y <https://stripe.com/docs/design> (claridad en flujos de pago y estados).
- Linear Method — <https://linear.app/method> (densidad, listas, velocidad percibida).
- Vercel — <https://vercel.com/design> (contraste, sistemas sobrios, tipografía).
- Domestika — <https://www.domestika.org/> (catálogo editorial de cursos: referencia de **estructura**, no de marca).
- Nike — <https://www.nike.com/> (impacto visual y jerarquía: referencia de **idea**, nunca de paleta ni tipografía).

Ninguna de estas marcas se reproduce: solo se observa el problema que resuelve
su patrón.

## 11. Cómo probar los dieciocho temas mañana

1. **Selector en cabecera:** botón «Tema» (`app-theme-selector`, `aria-label=
   "Cambiar tema"`), menú `role="menu"` con `menuitemradio` y ✓ en el activo.
   Debe abrirse con teclado, cerrarse con Escape y devolver el foco al botón.
2. **Cambio instantáneo:** al elegir, `ThemeService` aplica `data-theme` en
   `<html>`, actualiza `meta[name=theme-color]` y repinta sin recargar. No debe
   parpadear ni romper el menú móvil.
3. **Persistencia:** se guarda solo `{version, theme}` en `localStorage` con
   clave `academia-theme-v1`. Recargar y navegar (incluida el aula) mantiene el
   tema. Sin `localStorage`, el tema sigue activo en la sesión.
4. **Pasada por las dieciocho opciones**, mirando en cada vista:
   - **Portada provisional:** contraste del titular en display, legibilidad de
     `.lead` y del texto de apoyo, ancho de contenido.
   - **Catálogo / ficha:** tarjeta de curso (borde, radio, sombra, `card-pad`),
     badge de nivel, CTA primario único y foco con teclado.
   - **Aula:** índice lateral con fila activa diferenciada, barra de acciones
     sobre el vídeo, materiales y dudas; en móvil, hamburguesa desde la
     izquierda y objetivo de 44 px.
   - **Admin:** campos, tablas/listas, feedback de éxito/error y estados
     disabled; el anillo de foco no debe perderse en ningún control.
5. **Cláusula de cierre:** antes de darlo por bueno, comprobar que los dieciocho
   ids del selector tienen su bloque en `theme-tokens.scss` y en
   `theme-components.scss`, y que las especificaciones cubren dieciocho. Si
   falta alguno, se reporta; no se rellena a ojo.
6. **Accesibilidad final:** `color-scheme: light` y superficies claras en los
   dieciocho temas; contraste AA, zoom 200 %, `prefers-reduced-motion`,
   esqueletos sin movimiento innecesario y navegación solo con teclado en
   **los dieciocho temas**, con `creator`, `brutalista`, `impacto` y `linea`
   como mínimo obligatorio. Ningún tema queda exento de AA (§2 y §3).

## 12. Reglas de no copia

- No paletas, códigos hex ni gradientes tomados de otra web o referencia;
  los valores viven en `theme-tokens.scss` y son propios.
- No tipografías propietarias ni de marca de terceros: solo las dos fuentes
  locales con licencia OFL versionadas en `public/fonts/`.
- No logotipos, nombres, textos, capturas, imágenes ni vídeos de otras
  plataformas; el material del curso es contenido propio del promotor.
- No HTML, tokens ni branding de la referencia funcional aprobada: se replica
  la **posición funcional** (barra arriba del vídeo, índice lateral,
  hamburguesa a la izquierda), nunca su apariencia.
- No secretos, correos de alumnos, ventas ni datos personales en tokens,
  documentación ni capturas.
- Si una referencia externa se usa como inspiración, se documenta el patrón
  aprendido (§10), nunca el asset copiado.
