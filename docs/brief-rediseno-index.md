# Brief de rediseño integral del index

Documento de encargo autocontenido. Destinatario: el agente que ejecute el
rediseño. Repositorio: `academia-acordes-gaditanos`. Fecha: 2026-11-26.

Condiciones de ejecución: trabajar en primer plano y sin repartir la
implementación entre subagentes; el commit lo ejecuta el subagente de Git
designado según `AGENTS.md`. Modelo asignado por quien orquesta:
`opencode/deepseek-v4.1-flash-free` (free); no cambiar a AMD ni a otro modelo por
iniciativa propia. Nada de servicios cloud, pagos, PDF/vídeo, instalaciones ni
secretos. La verificación visual se hace en local, sin cuentas reales ni datos
personales.

---

## 1. Objetivo y mentalidad

El usuario lo ha pedido así: «quiero un rediseño del index, manteniendo la
paleta de colores y la estructura general, pero dejando todo mucho más bonito:
espacios, fuentes, paddings, margins, botones, rediseñar cards, rediseñar footer,
rediseñar secciones… rediseño general del index». Y ha añadido: «dejar el index
fino y eso nos valdrá para todo».

Está insatisfecho con los ajustes sucesivos porque han sido parches. Este
encargo es una **mirada holística**: una sola dirección visual para toda la
portada, con jerarquía, ritmo y acabado coherentes. No es cambiar números sueltos
ni sumar adornos.

El estilo global ya le gusta: tokens, tema único «Línea precisa», sencillez y
paleta se conservan. Lo que hay que mejorar de verdad es el estilo de las
**secciones, las cards, los espacios y los hovers**, sin recargar la interfaz.

**Se considerará logrado si:**

- el index se lee como una página diseñada de arriba abajo, no como bloques
  ensamblados;
- la jerarquía visual (h1 → h2 → h3 → cuerpo) se percibe sin mirar tamaños;
- las cards, los botones y las secciones comparten una misma lógica;
- se conservan la paleta, los textos, los CTAs, el orden de secciones y la
  honestidad del contenido;
- pasa las pruebas y la accesibilidad sin excepciones;
- el usuario lo ve y lo valida antes de darlo por bueno.

---

## 2. Alcance

### 2.1 Archivos que se pueden tocar

| Archivo | Uso |
| --- | --- |
| `src/app/features/home/home.html` | Estructura y semántica de la portada. |
| `src/app/features/home/home.scss` | Único lugar para el nuevo estilo del index. |
| `src/app/features/home/home.spec.ts` | Actualizar las aserciones visuales que fijen la implementación antigua; conservar las de comportamiento y accesibilidad. |
| `src/app/shared/site-footer/**` | **Solo propuesta y coordinación.** Es compartido por toda la web; no se implementa en el mismo cambio sin revisión. |
| `src/app/app.html`, `src/app/app.scss` | **Solo verificación.** El header es shell compartido; cualquier cambio va aparte y coordinado. |

Los assets existentes (`public/images/curso-cover.png`,
`public/images/profesor-placeholder.svg`) se reutilizan. No se añaden imágenes,
fuentes ni dependencias.

### 2.2 Fuera de alcance

- Backend, Supabase, RLS, Auth, Stripe, pagos, precios, webhook, Bunny, tokens de
  vídeo, materiales PDF, foro, favoritos y progreso.
- Decisiones de producto: precios, duración del acceso, reembolsos, packs,
  testimonios, foto/bio definitivas del profesor, número de cursos.
- Rutas, textos de marca, contenido y enlaces. No inventar datos.
- `src/app/core/theme/theme-tokens.scss`, `src/styles.scss` y cualquier estilo
  global. Los tokens y la paleta son la fuente de verdad y no se cambian.
- `angular.json`, `opencode.jsonc`, `package.json`, configuración de agentes ni
  dependencias. No activar las fuentes OFL ni cambiar `--font-body` /
  `--font-display` sin una decisión global aparte.
- `docs/plan-maestro.md` y `docs/privado/`: no se leen, no se editan y no se
  publican. El resto de documentación no se reescribe en este cambio; si un
  patrón se generaliza, se propone actualizar `docs/sistema-visual.md` aparte.
- Analítica, consentimiento, modo oscuro, SSR, AdSense/GTM.

### 2.3 Git y árbol de trabajo

- Commits **locales**, pequeños y por unidad coherente. Nunca `git add .`; solo
  archivos revisados. Sin push, sin PR, sin reescribir historial.
- Según `AGENTS.md`, el commit lo ejecuta el subagente de Git designado y
  autorizado; el implementador no commitea por iniciativa propia.
- El árbol puede contener cambios ajenos a esta tarea (por ejemplo
  `angular.json`, `opencode.jsonc` o `.playwright-mcp/`). **No incluirlos.**
- Antes de commitear: `git status`, `git diff` de los archivos propios y
  `git diff --check`.

---

## 3. Estado actual y decisiones congeladas

### 3.1 Base técnica

Angular 22.2 standalone, strict, SCSS, CSR estático, `lang="es"`. Tema único
claro `linea` fijado en `src/index.html`. Paleta real en
`src/app/core/theme/theme-tokens.scss`:

`--bg #eef0f5`, `--surface #ffffff`, `--ink #1a2030`, `--muted #5c6680`,
`--accent #3a5bd9`, `--accent-ink #ffffff`,
`--accent-strong #BE3D24` / `--accent-strong-ink #ffffff` (coral, solo el CTA
principal del hero), `--border #d3d9e6`, `--focus #2f6bff`, más
`--success`, `--warning`, `--danger` e `--info`. **No se cambia ningún color ni
se añaden literales nuevos.**

Sistema ya implementado globalmente (commits `edb780c` / `38ade70`): base 4 px,
`--space-1..7` = 4/8/12/16/24/32/48 px; `--section-gap` 3 rem,
`--block-gap` 1.5 rem, `--card-pad` 1 rem, `--card-gap` .5 rem,
`--grid-gap` 1 rem, `--focus-ring` 3 px; escala `--font-size-xs..3xl` =
0.75/0.875/1/1.125/1.25/2/3 rem; `--line-height-tight/normal/relaxed`; lead a
66 ch. Está fundamentado en Carbon, USWDS, Material 3 y WCAG (fuentes en §5).

### 3.2 Secciones actuales, en orden

El orden está congelado y lo comprueba `home.spec.ts`. No hay banner; no
reintroducirlo.

| `data-section` | Contenido y decisiones |
| --- | --- |
| `hero` | `h1` «Academia de Guitarra», subtítulo «De Acordes Gaditanos», lead, CTA primaria «Nuestros cursos» → `/cursos` (coral, sin hover de color) y secundaria «Acordes Gaditanos» → `https://acordesgaditanos.com/` (`target="_blank"`, `rel="noopener noreferrer"`). Visual SVG decorativo con `aria-hidden="true"`. |
| `cursos` | Dos bloques. Primero: «Aprende guitarra desde 0 / orientado al Carnaval», 3 tarjetas; si hay menos de 3 cursos reales se repite el primero. Cada tarjeta lleva un badge numérico 1–3; en este bloque no hay etiqueta textual de «muestra» y las pruebas impiden añadirla. Segundo: «Aprende guitarra / intermedia · contenido de muestra», 3 títulos «Curso de muestra · Intermedio 1/2/3» que enlazan a `/cursos`. Rejilla 3 columnas en escritorio y 2+1 en móvil. Tarjeta entera clicable con un único `<a class="home-card__link">` estirado y un `<span class="home-button--primary" aria-hidden="true">` decorativo. Imagen pequeña `images/curso-cover.png`. `<hr class="home-divider">` centrada y a todo el ancho entre bloques. Un solo «Ver todos los cursos» secundario. |
| `aprenderas` | «Qué aprenderás» + nota + lista de 4 áreas: ritmos y compás, mano derecha y rasgueos, punteos y digitación, acordes y bordoneos. |
| `preview` | «Cómo funciona» + `<ol>` de 3 pasos; el paso 2 enlaza a una lección de muestra real si existe. |
| `profesor` | «Tu profesor», `figure` con `profesor-placeholder.svg` (480×560, `object-fit: cover`, `aspect-ratio: 6/7`) y `figcaption` honesto. Nombre «Pablo Franco Toscano», rol «Profesor de guitarra de conservatorio» y bio de ejemplo. En móvil la foto va arriba; en escritorio, a la izquierda (42/58). |
| `testimonios` | «Testimonios» + aviso honesto de que aún no hay testimonios publicados. Sin citas, estrellas, avatares ni imágenes inventadas. |
| `cta` | «¿Por dónde empezar?», lead, CTA «Ver cursos» → `/cursos`, secundaria «Mi biblioteca» → `/mis-cursos` y, si existe, enlace terciario a la lección de muestra. |

El **footer** (`shared/site-footer`) está fuera de la portada pero el usuario
quiere rediseñarlo: tres grupos («Acordes Gaditanos», «Legal», «Autoría») y la
línea de copyright. Se revisará con propuesta, porque afecta a todas las
páginas.

### 3.3 Decisiones congeladas

1. Paleta y tokens: no se cambian ni se añaden colores. El coral
   `--accent-strong` se usa **solo** en la CTA principal del hero, máximo un
   elemento por vista.
2. Orden y número de secciones: exactamente las 7 de la tabla.
3. Textos, CTAs, destinos, enlaces externos y atributos de seguridad.
4. Tarjeta: un solo enlace estirado, un solo `span` decorativo `aria-hidden`;
   nunca un botón dentro de un enlace ni un segundo enlace.
5. Profesor: nombre y rol definitivos; bio y foto siguen siendo de muestra y se
   identifican como tales.
6. Honestidad: nada de precios, duraciones, niveles, valoraciones, testimonios,
   credenciales ni promesas inventadas.
7. Un solo `h1`; `h2`/`h3` sin saltos; cada `section[data-section]` mantiene
   `aria-labelledby` hacia un encabezado real.
8. El primary no cambia de color al hover; sí puede cambiar borde, sombra,
   elevación sutil o foco. Nada de `text-decoration` en botones ni enlaces de
   acción.
9. Foco visible con `outline: var(--focus-ring) solid var(--focus)`; objetivos
   táctiles de 44 px; `prefers-reduced-motion` respetado.
10. No deshacer: burger del header con X visible y sin borde, header con solo
    «Academia de Guitarra» y padding alineado al contenido, favoritos, `/foro`,
    tema único, skeletons y la migración de favoritos ya desplegada en DEV.

### 3.4 Hallazgos de la auditoría real (Playwright)

Antes del sistema actual: `h1` 52 px, `h2` 27.2 px, `h3` 14.4 px; secciones con
32 px frente a CTA de 14.4 px; imágenes de tarjeta de 80/56 px frente a títulos
demasiado pequeños; foto del profesor distorsionada (ya corregida); el primary
desbordaba 13 px a 320 px (ya corregido). El rediseño debe mejorar **jerarquía y
ritmo**, no solo cambiar esos números, y no reintroducir los dos defectos ya
corregidos.

### 3.5 Contrato de pruebas que hay que respetar

`home.spec.ts` tiene 35 pruebas. Muchas fijan detalles de la implementación
actual (por ejemplo `height: clamp(3.5rem, 8vw, 6rem)`, `grid-template-columns:
repeat(3, …)`, márgenes exactos, clases `home-section--tint-a/b`, el `span`
primario o la regla del coral). **Se pueden y se deben actualizar cuando cambie
la solución visual**, pero sin borrar ni debilitar las pruebas de:

- orden de secciones, un solo `h1`, textos y enlaces reales;
- estados de carga, vacío, error y no configurado;
- un único enlace por tarjeta y `span` decorativo;
- `aria-labelledby`, foco, 44 px, reduced-motion y ausencia de scroll horizontal;
- coral solo en el CTA del hero y ausencia de datos inventados.

No se acepta «arreglar» una prueba eliminándola. Si una aserción choca con una
decisión congelada, se detiene el trabajo y se consulta.

---

## 4. Encargo concreto por sección

Para cada sección: revisar jerarquía, espaciado, tipografía, imagen, hover y
accesibilidad. No se impone una solución cerrada salvo lo marcado como
congelado. Antes de añadir una card o un adorno, comprobar si basta con espacio,
línea y tipografía.

### 4.1 Hero

**Revisar:** equilibrio entre texto y visual; aire superior e inferior; distancia
entre `h1`, subtítulo, lead y CTAs; medida del lead (66 ch); alineación en
escritorio y apilado en móvil; que el SVG no compita con el texto. La CTA
principal puede tener una presencia algo mayor que el resto, pero con tokens,
misma base de botón y sin cambiar color ni hover. El foco debe verse sobre fondo
teñido.

**Congelado:** textos, dos CTAs y destinos, coral solo aquí, `span`/SVG
decorativos, orden `h1 → subtítulo → lead → acciones`.

**Criterio:** una sola CTA primaria en toda la página; el hero se entiende en
cinco segundos; a 320 px no hay desbordamiento y los botones siguen siendo
táctiles.

### 4.2 Cursos (bloques, cards, imagen y divisor)

**Revisar:** el ritmo entre título de bloque, rejilla, divisor y segundo bloque;
la proporción de la imagen (hoy demasiado baja respecto al título); el peso
visual del badge, del título y del `span`; el borde, radio, sombra y hover de la
tarjeta; la alineación del título de sección y del apoyo; el comportamiento
2+1; el foco visible en la tarjeta entera (`:focus-within`) y el estado hover sin
movimiento ni cambio de color del primary.

La tarjeta debe sentirse limpia: una sola superficie, una imagen con proporción
estable, título legible y una señal de acción discreta. El `span` decorativo
puede dejar de parecer un botón relleno si eso mejora la jerarquía, pero sigue
siendo un `span` `aria-hidden` no interactivo. Si se muestra el resumen real del
curso, solo cuando exista; nunca inventar metadatos, niveles, precios ni
duraciones.

**Congelado:** dos bloques y sus títulos; tres tarjetas por bloque; repetición
del primer curso cuando falten cursos; títulos de muestra del segundo bloque;
un único enlace estirado por tarjeta; un solo «Ver todos los cursos»; `<hr>`
divisoria a todo el ancho entre bloques; rejilla 3 / 2+1.

**Criterio:** las seis tarjetas se comparan sin ruido; la imagen no domina pero
tiene presencia; el divisor separa sin cortar la página; a 320 px caben dos
columnas sin scroll horizontal y la tercera se centra.

### 4.3 Qué aprenderás

**Revisar:** que no sea un párrafo con una lista suelta; ritmo entre `h2`, nota y
los 4 elementos; posibilidad de una lista a dos columnas en escritorio con
marcadores propios, sin convertirlos en cuatro cards innecesarias; legibilidad y
medida.

**Congelado:** los 4 contenidos y el aviso de que la disponibilidad depende de
los cursos publicados.

**Criterio:** se recorre en secuencia, no se compara en cuadrícula; los
marcadores no son el único indicador; sigue siendo una lista semántica.

### 4.4 Cómo funciona

**Revisar:** los 3 pasos como secuencia clara (numeración, línea o agrupación
sobria), el ancho de lectura, la separación entre pasos y los enlaces internos.
El paso 2 condicional no debe dejar un hueco raro cuando no hay lección.

**Congelado:** `<ol>` de 3 pasos, contenido y enlaces; sin promesas nuevas.

**Criterio:** se entiende el recorrido catálogo → muestra → biblioteca; los
enlaces tienen 44 px y foco visible; en móvil no hay líneas que se crucen.

### 4.5 Profesor

**Revisar:** proporción y encuadre de la foto; relación foto/texto en escritorio
y orden en móvil; jerarquía del nombre, rol y bio; tamaño del `figcaption`; aire
interno de la sección. La imagen no debe dominar ni distorsionarse
(`object-fit: cover`, `aspect-ratio`, `width`/`height`).

**Congelado:** `figure` + `figcaption`, placeholder, alt honesto, nombre, rol,
bio de ejemplo y orden móvil/escritorio.

**Criterio:** parece una presentación editorial, no una ficha de perfil
genérica; no se inventan credenciales, correos ni experiencia.

### 4.6 Testimonios

**Revisar:** que el estado vacío sea intencionado y no parezca una sección rota;
tratamiento sobrio del aviso, sin cajas decorativas vacías ni altura inflada.
Puede integrarse visualmente con el cierre de página sin cambiar el orden.

**Congelado:** no hay testimonios; no se inventan citas, nombres, estrellas,
avatares ni imágenes.

**Criterio:** el usuario entiende que el espacio está reservado y que aún no hay
contenido; no se promete nada.

### 4.7 CTA final

**Revisar:** el cierre de página; relación entre `h2`, lead, botones y enlace de
muestra; que no compita con el hero. La página ya tiene su CTA primaria en el
hero (coral): el cierre debe tener presencia sin convertirse en un segundo
primary relleno. Puede ser una banda sobria con una acción secundaria de alto
contraste, o la solución que se justifique, siempre con una sola CTA primaria
en la vista.

**Congelado:** textos, destinos, botones y enlace condicional a la lección.

**Criterio:** cierra la página con claridad; no hay dos botones rellenos
compitiendo; el foco y los 44 px se mantienen.

### 4.8 Footer (compartido, propuesta coordinada)

**Revisar:** hoy usa `--max-width` (68 rem) en vez de `--content-max-width`
(72 rem), paddings de 1.5/1.25 rem, tamaños ad-hoc y fallbacks literales de color
(`#ddd2c0`, `#fffdf8`, etc.). Proponer: alineación con el ancho y padding del
contenido, escala de espaciado, jerarquía de los tres grupos, separación,
tratamiento de enlaces y foco, y apilado responsive. Mantener la sobriedad y la
paleta; nada de footer oscuro ni de una identidad nueva.

**Congelado:** contenido, enlaces, textos legales, autoría y copyright. No
cambiar rutas ni añadir redes.

**Criterio:** el footer parece parte del mismo sistema que el index, sin romper
ninguna otra página. Se entrega como propuesta visual y se implementa en un
cambio aparte, coordinado con quien mantiene los compartidos. No incluirlo en el
mismo commit del index sin revisión.

### 4.9 Header en móvil (solo verificación)

El header es shell compartido y está congelado: solo «Academia de Guitarra»,
padding alineado al contenido, burger con X visible y sin borde, overlay a
pantalla completa, `aria-expanded`, cierre con Escape y al navegar, foco
devuelto al botón. **No se rediseña aquí.** Verificar que el nuevo index no
rompe la apertura/cierre, el sticky, el skip-link ni el foco, y que no aparece
scroll horizontal. Cualquier mejora se propone aparte.

---

## 5. Principios y fuentes

### 5.1 Espaciado y ritmo

Una sola escala: **sección 48 px / bloque 24 px / tarjeta 16 px / intra 8 px**,
con los tokens existentes. Entre secciones manda `--section-gap`; entre bloques,
`--block-gap`; dentro de una card, `--card-pad` y `--card-gap`; entre cards,
`--grid-gap`. Usar `gap` entre hermanos; `margin` solo hacia el exterior. No
añadir márgenes negativos: el sangrado de `.home` es una excepción existente y
documentada, no un patrón nuevo. No mezclar `margin` y `padding` para el mismo
fin.

El fondo de cada sección va a sangre y el contenido se alinea en `.home-inner`
(`max-width: var(--content-max-width)`, `padding-inline:
clamp(1.25rem, 5vw, 3rem)`); conservar ese contrato.

### 5.2 Tipografía

Usar la escala `--font-size-*`, `--line-height-*` y `--weight-*`. Titulares con
`clamp()` y la escala existente, sin px sueltos. Prosa a 66 ch; titulares y
etiquetas cortas, sin líneas eternas. `h2` de sección y `h3` de tarjeta deben
distinguirse por tamaño, peso y espacio, no por colores nuevos. No cambiar las
familias (`--font-body` Courier New, `--font-display` system-ui) ni activar las
OFL en este encargo: eso afecta a toda la app y requiere una decisión global.

### 5.3 Color, foco y accesibilidad

- Solo tokens; cero hex/rgb nuevos en `home.scss` (`color-mix` con tokens está
  permitido si ya se usa).
- Texto ≥ 4,5:1; controles y bordes ≥ 3:1. El color nunca es el único
  indicador.
- Foco de 3 px con `--focus` en `:focus-visible`, también en la tarjeta entera.
- Objetivos táctiles de 44 px y separación entre vecinos.
- Sin scroll horizontal a 320 px ni con zoom al 200 %.
- `prefers-reduced-motion: reduce` desactiva transiciones y desplazamientos.
- Un solo primary por vista; el coral solo en el hero.

### 5.4 Semántica

Un `h1`; `h2`/`h3` sin saltos; `section aria-labelledby` hacia un encabezado
real; `<nav aria-label>`; `<a>` para navegar y `<button>` para actuar; un solo
enlace estirado por tarjeta; `<ul>/<li>` para colecciones; `<figure>` +
`<figcaption>` para la foto; SVG decorativos con `aria-hidden="true"` y
`focusable="false"`; iconos con texto o `aria-label`.

### 5.5 Fuentes de patrón (no de copia)

- Material 3: <https://m3.material.io/>
- Carbon — spacing: <https://carbondesignsystem.com/elements/spacing/overview/>
- USWDS — spacing: <https://designsystem.digital.gov/utilities/spacing/>
- web.dev — Learn CSS, spacing: <https://web.dev/learn/css/spacing>
- WCAG 2.2 Quick Reference: <https://www.w3.org/WAI/WCAG22/quickref/>
- MDN — `clamp()`: <https://developer.mozilla.org/es/docs/Web/CSS/clamp>
- MDN — `prefers-reduced-motion`:
  <https://developer.mozilla.org/es/docs/Web/CSS/@media/prefers-reduced-motion>

Se copian patrones y criterios, nunca paletas, fuentes, logotipos, textos ni
assets de esas marcas.

---

## 6. Criterios de aceptación medibles

| Comprobación | Criterio |
| --- | --- |
| `npm test` | Toda la suite en verde, incluidas las pruebas de portada (hoy 35) actualizadas con intención. |
| `npm run test:functions` | Sin fallos. |
| `npm run test:sql` | Sin fallos. |
| `npm run build` | Build correcto, sin warnings. El presupuesto `anyComponentStyle` es 4 kB (warning) / 8 kB (error): si `home.scss` se pasa, se refactoriza el CSS; **no se toca `angular.json`**. |
| `git diff --check` | Limpio. |
| 320 / 390 / 768 / 1024 / 1440 px | Sin scroll horizontal (`scrollWidth <= innerWidth`), sin solapes ni cortes. |
| Contraste | AA: texto ≥ 4,5:1; UI y bordes ≥ 3:1, en reposo, hover, foco y disabled. |
| Zoom 200 % | Sin pérdida de contenido, sin solapes, sin scroll horizontal. |
| Teclado | Recorrido completo: header, hero, tarjetas, enlaces, CTA final, footer; foco siempre visible; la tarjeta entera muestra foco. |
| Reduced motion | Sin transiciones ni desplazamientos con la preferencia activa. |
| Semántica | Un `h1`; sin saltos; `aria-labelledby` válidos; un enlace por tarjeta; sin botón dentro de enlace. |
| Paleta | Cero literales nuevos; `--accent-strong` solo en el CTA del hero. |
| Contenido | Sin precios, niveles, duraciones, testimonios, credenciales ni promesas inventadas. |
| Capturas | Antes/después a 320, 390 y 1440 px (y una vista intermedia), guardadas **fuera del repositorio**, sin datos personales. |

Evidencia mínima para revisar: capturas, salida de los comandos y una nota de
las comprobaciones manuales. Los tests verdes no sustituyen la revisión visual.

---

## 7. Flujo sugerido

1. **Línea base.** Leer este brief, `AGENTS.md`, `docs/rediseno-integral.md`,
   `docs/sistema-visual.md`, `home.html`, `home.scss`, `theme-tokens.scss`,
   `app.html` y `app.scss`. Ejecutar tests y build antes de tocar nada; capturar
   el antes y anotar el estado del árbol.
2. **Auditoría.** Revisar la portada a 320, 390, 768 y 1440 px: jerarquía,
   ritmo, cards, imágenes, hovers, foco y desbordamientos. Separar lo que es
   problema real de lo que es preferencia.
3. **Propuesta breve.** Antes de implementar, entregar una dirección visual de
   una página: qué se conserva, qué cambia en cada sección y cómo se resuelve la
   jerarquía de CTAs. El usuario quiere validar el rumbo.
4. **Implementación por secciones.** Hero → cursos/cards → aprenderás/cómo
   funciona → profesor → testimonios/CTA → responsive, foco y hovers. Ejecutar
   tests tras cada bloque. No reescribir todo de golpe.
5. **Verificación.** Matriz de anchos, contraste, teclado, zoom, reduced-motion,
   `npm test`, `test:functions`, `test:sql`, `build` y `git diff --check`.
   Actualizar `home.spec.ts` solo donde la solución visual cambie, conservando
   las garantías.
6. **Revisión del usuario.** Enseñar el resultado con capturas antes/después.
   No darlo por bueno hasta que lo valide.
7. **Commit local.** Solo entonces, con los archivos revisados y sin cambios
   ajenos. Lo ejecuta el subagente de Git designado. Sin push.

**Condiciones de parada:** si hace falta tocar tokens, estilos globales, header,
footer compartido, dependencias o una decisión de producto, detenerse y
proponerlo aparte. Si una prueba choca con una decisión congelada, no
sobreescribirla: consultar. Si el build avisa por tamaño de CSS, refactorizar,
no subir el presupuesto.

**Informe final (≤ 10 líneas):** archivos tocados, qué se rediseñó, comandos y
resultado, capturas revisadas, limitaciones y lo que queda pendiente de
coordinación (footer/header).
