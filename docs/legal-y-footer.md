# Legal, cookies y redes en el footer

Registro de alcance. Recoge requisitos **acordados** y decisiones **pendientes**. No
es un texto legal, no constituye asesoramiento jurídico y no implementa ninguna de
las piezas descritas: ni páginas, ni banner, ni enlaces, ni footer nuevo.

## Requisitos confirmados por el usuario

- El sitio tendrá una **página de privacidad** y una **página de política de
  cookies**. Los enlaces constan, pero los textos propios siguen pendientes.
- El footer enlazará esas páginas y, además, las redes sociales:
  - redes de marca **Acordes Gaditanos**;
  - perfiles personales **GitHub** y **LinkedIn** en un grupo **Desarrollo**;
  - los grupos de redes irán separados de los enlaces legales.
- **Única fuente de URL:** el usuario las aporta. No se deducen del remoto de Git, no
  se inventan y no se copian atributos de otro repositorio (p. ej. los Astro del
  cancionero).

### Redes de marca Acordes Gaditanos — URLs confirmadas

| Red | URL |
| --- | --- |
| X | <https://x.com/acordesgaditano> |
| YouTube | <https://www.youtube.com/@acordesgaditanos> |
| TikTok | <https://www.tiktok.com/@acordes.gaditanos> |
| Instagram | <https://www.instagram.com/acordesgaditanos/> |
| WhatsApp | <https://whatsapp.com/channel/0029VbET4pW3QxRxRJQOtB0I> |
| Telegram | <https://t.me/acordesgaditanos> |

### Grupo «Desarrollo» — perfiles personales y autoría

| Destino | URL |
| --- | --- |
| LinkedIn | <https://www.linkedin.com/in/javier-cordero-toscano> |
| GitHub | <https://github.com/javicordero> |

- Autoría, **texto exacto**: `Desarrollado por Javier Cordero Toscano`
- Enlazar a la URL de GitHub confirmada.

La implementación en el footer Angular la realiza otro agente, con estas URLs y ese
texto literal.

## Titular y contacto

La autoría tiene una única persona acreditada: **Javier Cordero Toscano**. Los datos
del **titular y contacto legal del servicio** (razón social si la hubiera, NIF,
domicilio y correo legal) **no figuran en este documento**. Si el usuario los aporta
en la fase adecuada al repositorio, se sustituirá este párrafo. Hasta entonces, no se
piden ni se recogen datos fiscales privados aquí.

- La página de privacidad debe identificar titular y un contacto para derechos.
- El aviso legal debe incluir la identidad del responsable del servicio.

Ese contenido lo valida el usuario fuera del repositorio.

## Necesidades a evaluar antes de vender

- **Aviso legal** y **condiciones de contratación**. Se registran como necesidades a
  evaluar antes de abrir la venta de cursos; no se afirma que las páginas existentes o
  previstas sean jurídicamente válidas ni suficientes. La validación legal es una
  decisión externa, no un resultado de este repositorio.
- No se redactan aquí textos legales definitivos ni el contenido de las políticas:
  el contenido lo decidirá el usuario cuando corresponda.

## Cookies: criterio, no implementación

- No hay banner de cookies ficticio, y no se debe insertar uno decorativo o preventivo.
- No se añaden trackers de marketing (ni GTM ni AdSense, coherente con `AGENTS.md`).
- El banner dependerá del uso real de cookies u otras tecnologías de almacenamiento no
  esenciales. Si se usan, se requiere **consentimiento previo** y **rechazar debe ser
  tan fácil como aceptar** (mismo nivel, mismo número de pasos).
- La política de cookies solo se redacta con el inventario real de cookies y
  tecnologías, que todavía no existe.
- **Contenido legal de esta academia pendiente:** privacidad y cookies no tienen textos
  todavía. No reutilizar como válidos los textos del cancionero ni enlazar páginas que
  no existan en esta aplicación. Del mismo modo, no copiar de otro index atributos de
  Astro/enlaces, etiquetas de analítica (GA) ni entradas a `/herramientas` o
  `/suscribirse`: esas rutas no existen aquí.
- Fecha legal y ruta de diseño: **provisionales** hasta que se redacten los documentos y
  se cierre el rediseño.

## Propuesta de enlaces — estado

- **Confirmado:** redes sociales (marca y personales), grupo «Desarrollo», autoría y
  páginas de privacidad y cookies. Las URL y el texto de autoría están en «Requisitos
  confirmados»; las páginas aún no tienen contenido.
- **Pendiente:** páginas de privacidad y de cookies; aún no tienen contenido.
- **Por confirmar:** enlaces de contenido legal/contacto en pie — `Contacto`,
  `Aviso legal` y `Condiciones de contratación`. Aceptados como requisitos, no como
  inventario cerrado ni como rutas o páginas ya existentes.

## Agrupación y accesibilidad

El footer deberá presentar, como mínimo, grupos separados y etiquetados:

1. Enlaces legales: privacidad y cookies. Ojo: aún no hay páginas propias; no enlazar
   rutas inexistentes ni copiar las del cancionero.
2. Redes de marca Acordes Gaditanos (X, YouTube, TikTok, Instagram, WhatsApp, Telegram),
   con las URL confirmadas.
3. **Desarrollo**: LinkedIn y GitHub personales (URL confirmadas) y la línea de autoría
   `Desarrollado por Javier Cordero Toscano` (texto literal).

Reglas de accesibilidad y seguridad:

- Enlaces externos con atributos seguros (`rel="noopener noreferrer"` cuando se abran en
  pestaña nueva, y destino explícito si aplica).
- Listas semánticas y encabezados o etiquetas accesibles por grupo; foco visible y
  operables con teclado. No usar agrupaciones solo visuales.
- Las redes y la autoría ya tienen URL confirmada. Privacidad y cookies siguen sin
  contenido: no son enlazables todavía hasta que existan sus páginas propias.

## Límites de esta tarea

- No se implementan páginas de privacidad y cookies ni el footer Angular en esta tarea.
  El footer lo cablea otro agente con las URL y el texto de esta ficha.
- No se crean textos legales definitivos ni se añaden banners de terceros.
- No se toca la app Angular, configuración, Supabase ni scripts.

## Pendientes y propietario

| Tema | Pendiente | Lo aporta |
| --- | --- | --- |
| Redacción y validación de privacidad y cookies | Texto propio de la academia; revisión legal externa | Usuario (fase de contenido legal) |
| Titular y contacto legal | Razón social, NIF, domicilio y correo legal: se aportan fuera de este archivo | Usuario, en fase adecuada |
| Enlaces legales extra | Confirmar si entran `Contacto`, `Aviso legal` y `Condiciones de contratación` | Usuario (por confirmar) |
| Layout | Provisional según el estilo actual; no cerrar diseño del footer | Usuario (decisión de estilo) |
| Inventario de cookies | Revisar uso real de almacenamiento/terceras partes antes de redactar | Usuario (fase de implementación) |
| Banner de cookies | Implementar solo si procede tras el inventario; consentimiento previo y rechazo equivalente | Usuario (fase adecuada) |
| Fecha legal | Provisional; se fija al publicar los textos | Usuario |

Otras notas de implementación Angular del footer (detalles concretos, atributos
seguros, pruebas) las marca el agente que lo implemente. Este documento no copia
atributos Astro, tags de analítica ni rutas de la web del cancionero.

Los datos del titular y contacto legal no se solicitan en el repositorio durante esta
tarea: los aportará el usuario en la fase adecuada, y no deben incluirse datos fiscales
privados en issues o commits públicos.
