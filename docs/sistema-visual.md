# Sistema visual de la academia (guía técnica)

Documento técnico público. Describe **cómo está organizado lo visual ya existente**;
no cierra la identidad definitiva ni decide pendientes del producto (nombre, foto,
bio, testimonios, precios ni diseño final de la portada). La fuente de verdad de
los valores es `src/app/core/theme/` (`theme-tokens.scss`, `fonts.scss`,
`theme-components.scss`) y `src/styles.scss`. Si este documento y el código
discrepasen, manda el código.

> **Nota de título (decisión aplicada):** el título es «Academia de Guitarra»,
> en `src/index.html` y en los títulos de documento de las rutas. La marca
> visible del shell usa «Academia de Guitarra» como texto principal y «De
> Acordes Gaditanos» como eyebrow. Decisión confirmada y aplicada.

> **Decisión adoptada:** el estilo único es **Línea precisa** (`linea`). Se fija
> con `data-theme="linea"` en el `<html>` de `src/index.html`, sin JavaScript,
> sin selector en la cabecera y sin persistencia en `localStorage`. Un tema
> oscuro queda para el futuro si se decide.

## 1. Principios

- **Token-first:** color, tipografía, espaciado, radio, sombra y borde se
  consumen como variables CSS (`--bg`, `--accent`, `--card-pad`, …). Un
  componente no fija valores de marca: los hereda de los tokens del estilo.
- **Accesibilidad primero:** foco visible siempre, contraste suficiente,
  objetivos táctiles grandes, estructura semántica y `lang="es"`. Si una
  decisión estética empeora la accesibilidad, gana la accesibilidad.
- **Consistencia antes que decoración:** una sola base de botón, feedback,
  lista y panel para toda la app; antes de añadir un adorno, se reutiliza un
  patrón existente.
- **Sin copiar marcas:** la inspiración es de patrones y métodos, nunca de
  paletas, tipografías propietarias, logotipos, textos ni assets de terceros
  (ver §9 y §11).

## 2. Estilo único: Línea precisa

El bloque `:root[data-theme='linea']` de `theme-tokens.scss` declara todos los
tokens. `theme-components.scss` aplica las reglas globales bajo el mismo
selector. `index.html` fija el atributo y el `meta[name="theme-color"]` a
`#eef0f5`, coherente con `--bg`. No hay `ThemeService`, selector ni clave
`academia-theme-v1` en uso: las claves antiguas que pudiera tener un usuario no
afectan al CSS aplicado.

Dimensiones reales declaradas (no se inventan valores):

| Concepto | Token | Valor |
| --- | --- | --- |
| Fondo / superficie / tarjeta | `--bg` / `--surface` / `--card-surface` | `#eef0f5` / `#ffffff` / `#ffffff` |
| Texto / secundario | `--ink` / `--muted` | `#1a2030` / `#5c6680` |
| Acento / texto sobre acento | `--accent` / `--accent-ink` | `#3a5bd9` / `#ffffff` |
| Borde / foco | `--border` / `--focus` | `#d3d9e6` / `#2f6bff` |
| Cuerpo / display | `--font-body` / `--font-display` | `'Courier New', Courier, monospace` / `system-ui, sans-serif` |
| Espaciado | `--space-1 … --space-5` | `0.2` / `0.4` / `0.65` / `1.05` / `1.6` rem |
| Huecos de composición | `--section-gap` / `--card-pad` / `--card-gap` / `--grid-gap` | `1.75` / `0.9` / `0.55` / `0.8` rem |
| Radios | `--radius-sm` / `--radius-md` / `--radius-lg` | `3` / `5` / `8` px |
| Sombras | `--shadow-card` / `--shadow-raised` | `0 1px 2px rgb(26 32 48 / 8%)` / `0 3px 10px rgb(26 32 48 / 12%)` |
| Borde y ancho | `--border-width` / `--content-max-width` | `1px` / `72rem` |
| Titulares | `--heading-transform` / `--heading-tracking` | `none` / `0.03em` |
| Densidad / botón / lista | `--density` / `--button-fill` / `--card-display` | `compact` / `ghost` / `stack` |
| Divisor de lista | `--list-divider` | `1px solid var(--border)` |
| Objetivo táctil / foco | `--tap-min` / `--focus-ring` | `2.75rem` / `2px` |

`color-scheme: light`, superficies claras y texto oscuro. La accesibilidad es
un requisito transversal del estilo, no una variante que se pueda perder.

## 3. Color

Los roles semánticos son el contrato; los tokens fijan sus valores:

- `--bg` fondo de página; `--surface` superficie elevada (tarjeta, panel);
  `--ink` texto principal; `--muted` texto secundario.
- `--accent` acción y énfasis; `--accent-ink` texto que va **sobre** el acento.
- `--border` divisores y contornos; `--focus` anillo de foco visible.
- `--success`, `--warning`, `--danger`, `--info` y sus `-ink` para feedback.
  El panel de administración deriva de ahí la familia `--admin-*`
  (`surface`, `surface-soft`, `surface-hover`, `field-bg`, `border`,
  `border-strong`, `text`, `text-muted`, `accent`, `accent-strong`,
  `accent-ink`, `focus`, estados disabled/success/warn/danger). No se crea una
  paleta paralela.

Reglas:

- Texto **≥ 4,5:1** contra su fondo; controles y bordes de interés **≥ 3:1**.
  Ante duda, se corrige la paleta.
- **El color nunca es el único indicador:** todo estado lleva además forma,
  texto o icono (check, «✓», `aria-checked`, mensaje escrito).
- El anillo de foco usa `--focus` en `:focus-visible` (`--focus-ring` de 2 px,
  con `outline-offset`), nunca se suprime sin alternativa visible.
- `meta[name="theme-color"]` es estático en `index.html` y coincide con `--bg`.

## 4. Tipografía

- El estilo fijado usa pilas locales o del sistema, sin descargar recursos:
  `--font-body` es `'Courier New', Courier, monospace` y `--font-display` es
  `system-ui, sans-serif`, aplicado a `h1, h2, h3`.
- `fonts.scss` y los dos woff2 con licencia OFL de `public/fonts/`
  (`roboto-mono-latin.woff2`, `bodoni-moda-latin.woff2`) siguen intactos y
  versionados como referencia y respaldo; no se han eliminado ni sustituido por
  descargas externas.
- **Escala en `rem`** para respetar la preferencia de tamaño del usuario. La
  base declara `line-height: 1.6`, titulares `1.15`, `h1` con
  `clamp(2.1rem, 5vw, 3.25rem)` y `h2` con `clamp(1.35rem, 2.5vw, 1.7rem)`;
  `.lead` se limita a ~60 ch y el ancho de contenido a `--content-max-width`.
- **Pesos:** 600/650/700 para acciones y etiquetas; 400 para lectura.
- **Zoom al 200 %:** sin pérdida de contenido ni solapes; los `clamp()`, el
  `flex-wrap` y las unidades `rem` deben absorberlo.

## 5. Espaciado, geometría e iconografía

- Los tokens de espaciado y geometría se dan en la tabla del §2. Se consumen en
  componentes (tarjeta de curso, esqueleto, panel); no se aplican al shell para
  no alterar la altura de la cabecera ni romper el menú móvil.
- Si un componente necesita una medida nueva, se añade como variable local
  documentada y se migra a token cuando más de un componente la comparta.
- **SVG inline**, con `viewBox`, `fill="none"`, `stroke="currentColor"` y
  `stroke-width` ~1,5–2 para heredar color y tamaño. Ejemplos: el icono de
  usuario del menú de cuenta y los controles del aula.
- **Tamaños:** 16, 20, 24 y 32 px. **Icono decorativo:** `aria-hidden="true"` y
  `focusable="false"`. **Icono solo:** el control lleva `aria-label`
  descriptivo, por ejemplo «Menú de usuario». **Icono + texto:** el texto nombra
  la acción.
- **Objetivos táctiles:** mínimo 44 px de alto y ancho en enlaces, botones y
  campos, con espacio entre objetivos vecinos.

## 6. Componentes y patrones

- **Botón primario:** una CTA principal por vista; relleno `--accent` con
  texto `--accent-ink` (base `.button`, `button[type=submit]`). En Línea
  precisa `--button-fill` es `ghost`, por lo que `.button` se dibuja como texto
  de acento con borde inferior de 2 px. **Secundario:** superficie
  `--admin-surface`, borde y texto de acento. **Terciario:** `.link-button`,
  sin borde, subrayado. Todos comparten `min-height: 44px`, `font: inherit` y
  el mismo patrón de hover/active/disabled.
- **Menú de cuenta:** botón con icono de usuario, `aria-label`, `aria-expanded`
  y `aria-controls`; desplegable con «Mi perfil», «Mis favoritos» y «Cerrar
  sesión». Nunca muestra el correo: solo un nombre seguro del perfil o un
  rótulo genérico. «Administración» sigue siendo un enlace separado porque es
  un permiso, no una opción de cuenta.
- **Badge:** etiqueta corta de estado o nivel; borde de 1 px, radio
  `--radius-sm`, texto en `--muted` o `--accent`, siempre acompañada de texto.
- **Feedback / alert / toast:** una sola base con borde izquierdo de 4 px y
  variantes `--success`, `--warning`, `--error`/`--danger`. `role="alert"` para
  mensajes que interrumpen; `aria-live` para avisos no urgentes.
- **Listas:** filas con separador (`--list-divider`) y padding `--space-*`,
  forma por defecto de temarios, progreso y administración (`--card-display`
  es `stack`).
- **Tablas:** cabecera con `<th scope="col">`, celdas alineadas; sin colores de
  estado aislados.
- **Paneles:** superficie `--surface`, borde `--border`, radio `--radius-md`,
  padding `--card-pad`. Para lectura larga, panel de medida, no tarjetas
  encadenadas.

## 7. Cuándo CARD y cuándo NO CARD

**SÍ card** (tarjeta de curso en rejilla): imagen/visual + metadatos + título +
resumen + CTA. Es una unidad independiente que se compara lado a lado con
otras en `cursos` y `mis-cursos` (`shared/course-card`). Usa `--card-pad`,
`--card-gap`, `--grid-gap`, `--radius-md` y `--shadow-card`.

**NO card:**

- Temario y progreso, lista de lecciones e índice del aula → **lista con
  separadores**, fila activa marcada con forma y texto.
- Filas de administración (cursos, bloques, materiales, comentarios) →
  **lista o tabla**, no una tarjeta por fila decorada.
- Filtros, controles de formulario y texto corrido → **panel de lectura** o
  grupo de campos, sin burbujas apiladas.
- Retorno y confirmación de pago / checkout → **panel sobrio** con el estado
  por escrito; nunca una card que parezca una oferta comercial.

Regla rápida: si la unidad se «compara en cuadrícula», card; si se «recorre en
secuencia», lista o tabla.

## 8. Estados

| Estado | Forma y color | Texto / semántica |
| --- | --- | --- |
| hover | fondo `--admin-surface-hover`, borde `--accent-strong` | Solo en controles interactivos; no sustituye al foco |
| focus | anillo `--focus` en `:focus-visible` (2 px) | Siempre visible con teclado |
| active | mismo realce que hover + desplazamiento de 1 px (se anula con reduced-motion) | Confirmación física de pulsación |
| disabled | borde `--admin-disabled-border`, fondo y texto disabled, `cursor: not-allowed`, `opacity: 1` | La etiqueta sigue legible |
| selected | borde/relleno de acento y marca visible (✓, `aria-checked`) | El estado se nombra, no solo se colorea |
| loading | esqueleto con `--muted`/`--surface` y aviso `sr-only` | Solo mientras cargan datos reales |
| error | borde izquierdo y superficie `--danger`, icono + mensaje | Qué falló y cómo corregirlo |

- **Un solo primario por vista.**
- **Reduced-motion:** `prefers-reduced-motion: reduce` desactiva transiciones,
  `scroll-behavior: smooth` y el barrido del esqueleto.

### Esqueletos de carga (`SkeletonBlock`)

`src/app/shared/skeleton/` expone `app-skeleton` (`SkeletonBlock`), un
componente **presentacional**: no consulta datos, no guarda estado y no
interactúa. Se coloca dentro de `@if (loading())` en cada página. Variantes
cerradas (`SKELETON_VARIANTS`): `text`, `title`, `card`, `list`, `video` e
`index`; `lines` (1–8, por defecto 3) solo afecta a `text`. Su geometría y color
vienen de los tokens, sin reglas por estilo.

- **Cuándo usarlos:** esperas de datos reales de duración incierta —listas,
  índice del aula, tarjetas de catálogo, titulares o el hueco del vídeo—,
  reservando la misma geometría que el contenido final.
- **Cuándo NO usarlos:** **pagos/checkout, subidas y confirmaciones**. Ahí se
  muestra el estado real por escrito con `role="status"` / `role="alert"`.
- **Accesibilidad:** las formas son decorativas (`aria-hidden="true"`) y un
  único aviso `.sr-only` con `role="status"` y `aria-atomic="true"` anuncia la
  carga. El barrido solo se genera bajo
  `@media (prefers-reduced-motion: no-preference)`.

## 9. Fuentes externas consultadas (solo patrones, no copia)

- Material 3 — <https://m3.material.io/> (tokens, estados, accesibilidad).
- Apple Human Interface Guidelines — <https://developer.apple.com/design/human-interface-guidelines/> (foco, objetivos táctiles, jerarquía).
- Stripe Design / Docs — <https://stripe.com/design> (claridad en flujos de pago).
- Linear Method — <https://linear.app/method> (densidad, listas, velocidad percibida).
- Vercel — <https://vercel.com/design> (contraste, sistemas sobrios).
- Domestika — <https://www.domestika.org/> (catálogo editorial: referencia de
  **estructura**, no de marca).

Ninguna de estas marcas se reproduce: solo se observa el problema que resuelve
su patrón.

## 10. Verificación del estilo único

El tema se aplica desde el HTML, sin JavaScript: comprobar que `index.html`
mantiene `data-theme="linea"`, que el CSS de `theme-tokens.scss` y
`theme-components.scss` usa ese mismo selector y que la cabecera no ofrece
selector de temas. Revisar contraste AA, zoom 200 %,
`prefers-reduced-motion`, esqueletos sin movimiento innecesario y navegación
solo con teclado —incluido el menú de usuario— en este único estilo. Las
pruebas automáticas de tokens y shell cubren la declaración y el DOM; la
revisión visual en navegador real queda fuera de esa cobertura.

## 11. Reglas de no copia

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
