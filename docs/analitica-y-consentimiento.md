# Consentimiento y analítica propia

Documentación técnica pública. La decisión de medir con una propiedad propia es
del promotor; **no hay ID de medición configurado** en el repositorio y la
analítica permanece desactivada hasta que se rellene en un archivo local
ignorado.

## Consentimiento

- `ConsentService` (`src/app/core/consent/`) expone signals con dos categorías:
  `necessary` (siempre `true`, recuerda la elección) y `analytics` (opcional).
- El banner ofrece **Aceptar todo**, **Rechazar opcional** y **Personalizar /
  Guardar preferencias**. Es una región no modal (`role="region"`,
  `aria-label="Preferencias de cookies"`): no roba el foco, no atrapa el
  tabulador y Escape no lo cierra, para no consentir por accidente.
- Tras decidir queda una entrada compacta («Cambiar preferencias») para poder
  retirar o modificar el consentimiento en cualquier momento.
- La persistencia usa `localStorage` con la clave `academia-cookie-consent` y
  `{ version: 1, analytics: boolean }`. No se guardan correos, identificadores,
  tokens, datos de cursos ni ningún otro dato personal. Una versión distinta o
  un valor corrupto se trata como «sin decisión» y vuelve a preguntarse.
- Si `analyticsCookieDomain` está configurado, la decisión se replica además en
  una cookie propia de ese dominio (`academia-cookie-consent`, `Path=/`,
  `SameSite=Lax`, `Secure` en HTTPS, un año de vigencia) con
  `{ version, necessary, analytics, updatedAt }`. Al arrancar se lee esa cookie
  **antes** que el `localStorage`, porque este último es por origen y el aviso
  se repetiría al pasar del dominio principal al subdominio. Sin dominio
  configurado no se crea esa cookie y todo sigue en `localStorage`.
- El aviso se renderiza en todo el shell, también en `/aula` y en la vista
  previa, donde la cabecera está oculta. En el aula se coloca en flujo para no
  tapar los controles del reproductor.

## Cuándo se carga la analítica

`AnalyticsService` (`src/app/core/analytics/`) solo carga GA4 si se cumplen las
tres condiciones: `analyticsMeasurementId` no vacío, consentimiento de
`analytics` activo y ausencia de Do Not Track (`navigator.doNotTrack`/`msDoNotTrack`)
cuando el navegador lo expone.

- Se inyecta de forma dinámica `https://www.googletagmanager.com/gtag/js?id=<ID>`.
  **No hay GTM ni AdSense** y el script no figura en `index.html`.
- Se configura `gtag('config', ID, { anonymize_ip: true })`. Si
  `analyticsCookieDomain` no está vacío se añade `cookie_domain` a esa llamada
  (`{ cookie_domain, anonymize_ip: true }`) y a las de página vista; si está
  vacío se omite la clave y GA mantiene su comportamiento automático.
- La misma propiedad GA4 puede medir el dominio principal y el subdominio: basta
  un `measurementId` propio, configurado en cada entorno. No se escribe en el
  repositorio. No se escriben cookies propias aparte de la preferencia.
- Las visitas se envían solo en `NavigationEnd` del router, con la ruta pública
  resuelta y sin query ni fragmento (`page_path`). No se envían correos,
  identificadores de usuario, progreso ni datos de lecciones privadas.
- El adaptador (`ga4-adapter.ts`) es el único que toca `gtag`; el servicio no
  depende del proveedor.

## Retirada del consentimiento

Al rechazar o desactivar la analítica se persiste el nuevo estado, se activa
`window['ga-disable-<ID>'] = true` y dejan de enviarse eventos. Al volver a
consentir se levanta esa marca y se reanuda el envío. Retirar el consentimiento
**no elimina cookies de terceros** que GA u otros sitios hubieran podido guardar
antes: esa limitación debe explicarse en los textos legales de cookies (a cargo
de la documentación legal, no de este archivo).

## Configuración

`analyticsMeasurementId` y `analyticsCookieDomain` son públicos y opcionales.
La plantilla versionada `src/environments/environment.local.example.ts` los deja
vacíos; se rellenan solo en la copia ignorada `src/environments/environment.local.ts`
y en la configuración del entorno de producción cuando se cierre el dominio.
El ID es de una propiedad propia (puede ser única para dominio y subdominio); el
dominio compartido lleva punto delante, p. ej. `.acordesgaditanos.com`. No son
secretos, pero no se versionan para no publicar una propiedad ajena ni medir
antes de tiempo. No hay claves secretas de Bunny ni de Stripe en el cliente.

## Verificación y límites

Pruebas unitarias: consentimiento y persistencia, inyección condicional del
script, DNT, retirada/opt-out, page views solo tras `NavigationEnd`, acceso y
foco del banner y detección de aula del shell. No hay E2E ni ID real: no se ha
comprobado tráfico contra una propiedad GA4 ni el comportamiento de `gtag.js`
en un navegador con red. La detección de DNT depende de lo que exponga cada
navegador.
