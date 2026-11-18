# Decisiones de producto (registro de alcance)

Registro breve de precisiones de producto acordadas con el usuario. Recoge un
hecho **confirmado** y varias cuestiones **pendientes**. No es un plan cerrado,
no decide el modelo definitivo y no implementa nada: no toca la base de datos,
el código, las migraciones ni las pruebas. No reproduce el plan privado
(`docs/plan-maestro.md`), ni datos o cursos reales del usuario, ni precios,
temario o biografía.

## Confirmado por el usuario

- **Vídeo provisional:** desarrollar ahora con YouTube solo como demo local, sin
  contratar servicios, pagar ni aportar tarjeta. Un enlace no listado puede
  compartirse y no protege contenidos de pago. Antes de lanzar, evaluar Mux con
  pocos vídeos y las condiciones PAYG vigentes; Bunny sigue como alternativa,
  sin elección definitiva ni garantía de gratuidad o condiciones futuras. Mux
  Free se está evaluando para un piloto de hasta 10 vídeos; no hay proveedor
  definitivo ni costes futuros garantizados. No se implanta Mux ni se contrata
  ningún servicio en la nube ahora.
- **Validación manual:** el usuario ha probado la creación de un curso y de
  bloques, y la estructura inicial resulta funcional para ese uso manual.
  Esta comprobación se refiere a esa operación concreta de alta de curso y
  bloques; no se extiende a otros flujos.

## Proveedor de vídeo (2026-11-18)

Sustituye a la entrada «Vídeo provisional» de «Confirmado por el usuario».

- **Elegido:** Bunny Stream sustituye a la política anterior (YouTube solo demo
  en desarrollo, evaluar Mux, Bunny como alternativa no cerrada), por decisión
  expresa del promotor.
- **Reproducción:** solo con `url`/token firmado emitido en servidor (Edge
  Function) tras verificar sesión y derecho activo, o rol admin para vista
  previa. Nunca claves de firma, API key de Bunny ni tokens de larga duración en
  el cliente o el repositorio.
- **Configuración de servidor:** ya está aplicada en DEV (token authentication
  activo y modo sin firma apagado); la región, los vídeos y los derechos siguen
  pendientes (decisión pendiente). Nada de esto en el repositorio, el chat,
  `environment.local.ts` ni filas públicas.
- **Metadatos:** `private.lesson_videos` guarda como mínimo `lesson_id`,
  `provider` = 'bunny', el library ID, el GUID del vídeo, estado de procesamiento
  y duración; nada de eso en `public.lessons` ni en el catálogo público.
- **Límites:** token de embed de corta duración; el enlace puede compartirse
  hasta caducar. No es DRM ni impide grabar la pantalla: no se promete protección
  absoluta.
- **Desarrollo:** `video-demo.local.ts` (YouTube, ignorado) queda solo como
  *fallback* de maquetación en desarrollo, con Bunny ya configurado y verificado
  en DEV. El reproductor sigue el contrato desacoplado
  `VideoPlaybackProvider`/servicio inyectable.
- **Coste:** mínimo aproximado 1 USD/mes y consumo variable; el trial de
  20 USD/14 días es un dato, no un plan gratuito permanente. No se contrata ni
  se añade tarjeta sin autorización explícita del promotor.
- **Activación incremental:** código y pruebas con mocks, configuración en
  Supabase y verificación real: **hecho en DEV**; queda la comprobación en
  producción (decisión pendiente).
- **Muestra:** biblioteca de desarrollo 812678; `COLGAOS.mp4` es contenido propio
  del promotor y será el vídeo de la primera lección del curso real. Ningún vídeo
  se descarga ni copia al repo; los `*.mp4` pesados no se versionan. Sin copiar
  branding, texto ni assets de otras plataformas.

## Prioridad y referencia funcional acordada (2026-11-17)

- **Prioridad acordada:** completar la **funcionalidad restante antes** de
  acometer nuevos ajustes de estilo o layout.
- **Referencia funcional aprobada:** la futura revisión de diseño debe
  **replicar la posición funcional** ya aprobada, sin copiar HTML, tokens ni
  branding de la referencia:
  - **barra de acciones arriba del vídeo:** flechas prev/next y botón de
    «completar» manual;
  - **móvil:** un botón de hamburguesa despliega el panel de índice **desde la
    izquierda**;
  - **escritorio:** índice a la izquierda, bloque de lecciones ordenadas,
    vídeo principal y, debajo, materiales / cuerpo / comentarios asociados
    (estos últimos, de cara al futuro).
- **Estética:** identidad propia; no copiar branding ni assets de la
  referencia.
- **No por interpretación:** los requisitos de layout no se deciden por
  interpretación del agente; se mantienen las condiciones de accesibilidad.
- **Alcance:** no implementar estos cambios de layout ahora. El modelo
  editorial y el diseño final siguen **provisionales** hasta una revisión
  futura; se conservan cursos, identificadores, contenido, progreso, derechos
  y pagos.

## Carácter provisional del modelo

- La organización **cursos → bloques → lecciones** y el modelo pedagógico /
  editorial que la sostiene son **provisionales**.
- Están pendientes de **revisión futura antes de consolidar el catálogo y antes
  del lanzamiento**. Revisar no significa rediseñar ahora: el rediseño no se
  aborda en esta fase.
- El **estilo visual provisional ya acordado** (`AGENTS.md`) es una cuestión
  distinta: no debe confundirse ni converger con la decisión del modelo
  definitivo de cursos.

## Límites de la validación

- La prueba manual del usuario **no demuestra seguridad ni comportamiento de
  RLS**: eso sigue dependiendo de las migraciones y pruebas de SQL, y de la
  verificación real con Supabase, según `docs/arquitectura-datos.md`.
- Tampoco acredita la cobertura **E2E de todos los campos**: no se da por
  validado ningún recorrido completo ni todo el formulario por el hecho de que
  se haya creado un curso y bloques manualmente.

## Criterio técnico recomendado para futuras evoluciones

Cuando el modelo se revise, cualquier evolución del esquema debe:

- **preservar los identificadores** de cursos y lecciones, el progreso, los
  accesos y los pagos;
- hacerse mediante **migraciones versionadas y sus pruebas** correspondientes;
- **no rehacer ni borrar contenido real** para adaptarlo a un rediseño.

Esto es un **criterio técnico recomendado**, no una nueva decisión de negocio
ni un calendario comprometido.

## Pendiente de revisión futura (sin decisiones cerradas)

Agrupación y módulos, temario, plantilla de lección, metadatos y necesidades
del profesor. Se enumeran como temas a revisar; no se fija aquí su forma,
alcance ni contenido.

### Límite sobre el proveedor de vídeo

La afirmación de que este documento no cambia `AGENTS.md` ni `README.md` no se
extiende al proveedor de vídeo: la entrada del 2026-11-18 sustituye la política
anterior recogida en esas dos guías, porque este registro no es documento
normativo de agentes. Se conserva la fecha de registro original del documento.

## Límites y fecha

- Este documento **no cambia** `AGENTS.md`, `README.md` ni
  `docs/arquitectura-datos.md`, y no modifica migraciones, SQL ni código.
- Registrado el **2026-11-17** (fecha del entorno de trabajo). Si esa fecha no
  se considera válida como evidencia, debe entenderse como la del registro y no
  como una fecha de decisión de producto.

## Precio de prueba Stripe (2026-11-18)

- El promotor ha creado un precio en Stripe y lo ha facilitado como dato
  **público de configuración** de servidor; no es un secreto de cuenta ni una
  clave API.
- Identificador del precio de curso de prueba en DEVELOPMENT: se anotará en el
  panel de Supabase `course_prices` como referencia del curso real de pruebas
  (no se pega aquí; solo en servidor pertinente).
- La clave secreta de Stripe (`sk_test`) la ha configurado el promotor a mano en
  los secretos de Edge Functions de Supabase; este repositorio no la contiene ni
  debe contenerla.
- Reglas que se mantienen: `price_...` no entra en el bundle Angular; el
  navegador solo recibe la URL de checkout; la página de éxito no concede acceso;
  el acceso se concede por webhook firmado e idempotente; el checkout `enabled`
  solo está activo en TEST y es reversible (verificado en DEV/TEST).
- Hecho en TEST: fulfillment integrado, webhook desplegado en Supabase y compra
  E2E completada con pedido pagado, derecho activo y evento procesado. No hay E2E
  en producción ni Stripe live.
- Pendiente antes de cobrar con usuarios: condiciones legales/fiscales (D3, D4),
  precios definitivos (D7), copia de seguridad (D16) y el resto de decisiones
  abiertas (decisión pendiente).

## Páginas legales como plantillas orientativas (2026-11-18)

- **Decisión del usuario:** incorporar los términos de compra y el resto de
  páginas legales y de cookies habituales en la academia.
- **Alcance implementado:** cinco páginas en español bajo `/legal/` (aviso
  legal, privacidad, cookies, términos de compra y reembolsos), enlazadas desde
  el pie de página. Son **plantillas orientativas**, señaladas visiblemente con
  «Plantilla orientativa: revisar antes de publicación»: no constituyen
  asesoramiento jurídico y **no se dan por válidas legalmente**.
- **Marcadores, no datos reales:** `[Titular]`, `[CIF/NIF]`, `[Domicilio]` y
  `[Correo de contacto]`. No se han inventado razón social, NIF, dirección,
  correo, precios ni procedimientos internos.
- **Contenido deliberadamente neutro:** privacidad describe finalidades
  previstas (cuenta, compra, acceso, progreso y dudas), legitimación orientativa
  y proveedores técnicos (Supabase, Stripe y Bunny Stream) sin secretos;
  cookies distingue necesarias de analítica opcional **sin activar analítica**;
  términos recoge compra individual sin suscripción, pago verificado por
  webhook firmado, precio final mostrado en checkout, acceso sin caducidad
  programada pero revocable, progreso manual y cuenta única; reembolsos recoge
  el plazo legal de desistimiento cuando aplique y la salvedad de contenidos
  digitales suministrados de inmediato, sin prometer reembolso automático.
- **Límites:** el banner de consentimiento queda fuera de este alcance; las
  páginas solo explican cómo funcionaría y no activan categorías opcionales.
  La identidad del titular (D1), los textos definitivos y el inventario de
  cookies (D2), las condiciones de contratación y fiscalidad (D3), la política
  de reembolsos (D4) y la retirada de cursos (D5) siguen **pendientes** y
  requieren revisión profesional antes de publicar o vender.
