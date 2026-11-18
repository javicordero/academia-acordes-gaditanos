# Estado del vídeo (Bunny Stream)

Registro breve del estado real. Sin claves, sin valores de configuración.
La decisión de proveedor vive en `docs/decisiones-producto.md` (2026-11-18).

## Una sola variable para alternar proveedor

El único interruptor es `videoPlaybackBunny`, configuración pública que vive en
`environment.local.ts` (ignorado) y en la plantilla
`environment.local.example.ts`. No es un secreto y no cambia nada en servidor.

- `false` — en desarrollo se usa la maquetación YouTube ya existente en
  `video-demo.local.ts` (exige que el mapa contenga la lección). No se invoca
  `lesson-video-token`, no se monta ningún iframe de Bunny y no se hacen
  llamadas ni miniaturas a Bunny. Si la lección no está en el mapa, el aula no
  muestra nada: no hay respaldo Bunny por coste. El aviso indica expresamente
  que es YouTube de desarrollo, no Bunny, y que no protege contenido de pago.
- `true` — sigue la integración Bunny con URL/token firmado emitido en
  servidor, sin claves ni identificadores de vídeo en el cliente.

En DEV la integración Bunny está activa y verificada: vídeo de prueba subido y
listo, token authentication activo y modo sin firma apagado (verificado en DEV).
La plantilla versionada y el valor por defecto siguen siendo `false` (producción
segura, sin demo); YouTube queda solo como flag local de desarrollo. El coste de
Bunny (almacenamiento y transferencia) es independiente del reproductor y no es
cero.

## Qué existe hoy

- `private.lesson_videos` (migración inicial `20261117120000`): `lesson_id`
  PK, `provider` (`'bunny'`), `provider_video_id`, `provider_library_id`,
  `duration_seconds`, `status` (`pending` | `ready` | `disabled`),
  `created_at`, `updated_at`, `UNIQUE (provider, provider_video_id)`, CHECK de
  duración, RLS sin políticas y ACL solo para `service_role`.
- RPC puente `public.server_lesson_video(p_user_id, p_lesson_id)`
  (`20261117230000_server_lesson_video.sql`), calcada del patrón PDF:
  - devuelve `{ course_id, preview, video }` o no devuelve fila;
  - solo lección publicada de curso `published` y con derecho de `p_user_id`:
    muestra gratuita, o admin en `public.user_roles`, o `entitlement` vigente;
  - `video` solo si hay fila `provider = 'bunny'`, `status = 'ready'`, GUID con
    forma UUID y library numérica (1-12 dígitos); si no, `video` es `null`;
  - `EXECUTE` revocado a `public`, `anon` y `authenticated`; concedido solo a
    `service_role`. `p_user_id` debe salir de una sesión verificada en servidor.
- Prueba SQL local `supabase/tests/0012_server_lesson_video.psql`.

Todo lo anterior es **SQL local**, ejercitado con PGlite (`npm run test:sql`).

## Cliente Angular (código local, verificado en DEV)

- Adaptador `BunnyStreamPlaybackProvider` desacoplado tras
  `VideoPlaybackProvider`, con validación estricta de la respuesta firmada.
  Pide la firma a `lesson-video-token` y comprueba dominio, ruta, token y
  `expires`; si algo no cuadra, no monta el iframe.
- `VIDEO_PLAYBACK_PROVIDER` **sí está registrado** en `app.config.ts`. El flag
  público `videoPlaybackBunny` (configuración pública de Supabase) vale
  `false` por defecto; solo selecciona el proveedor esperado, nunca guarda
  secretos. Si el servidor responde 503/403, el aula muestra un estado honesto.
- Caducidad: `expiresAt` llega en segundos Unix y se convierte a milisegundos;
  el adaptador exige margen de 5 s y un TTL máximo de 30 días. La firma se
  renueva al volver a pedirla; no se promete reproducción ininterrumpida.
- Sin el flag, producción no carga YouTube: usa el proveedor no disponible.
  YouTube solo existe en desarrollo como maquetación de `video-demo.local.ts`.
- UX del aula y de la vista previa: al entrar en una lección de vídeo ya
  autorizada se pide la fuente y se monta el reproductor sin pulsar «Ver vídeo»;
  no hay autoplay (el alumno pulsa Play), se anuncia el aviso del proveedor y
  el estado de carga, y no se mueve el foco al iframe. Caducar retira el `src`;
  solo entonces, o ante un error, se ofrece renovar/reintentar.

## Qué NO está hecho

- Despliegue de producción: hay un proyecto Supabase de desarrollo migrado y
  funciones desplegadas, pero nada aplicado en producción.
- Las Edge Functions (`lesson-video-token`, `link-lesson-video`) están
  desplegadas y probadas en DEV (verificado en DEV/TEST).
- **Token authentication de Bunny está activo** y el modo sin firma está apagado
  (verificado en DEV).
- Vídeo de prueba subido por TUS desde `/admin` y listo en Bunny (verificado en
  DEV); el vídeo definitivo sigue sujeto a decisión pendiente.
- La configuración de servidor ya está aplicada en DEV; nada de ella en el
  repositorio, el chat, `environment.local.ts` ni filas públicas.
- La comprobación visual en móvil sigue pendiente; la reproducción con Bunny
  real sí se verificó en DEV, no en producción.
- `VideoPlaybackService.expiresAt()` queda como API latente sin consumidores: el
  aula usa `PlaybackSource.expiresAt`. No se refactoriza en este cambio.

## Gate: orden obligatorio

En DEV estos pasos ya se ejecutaron y verificaron (verificado en DEV); en
producción siguen siendo el orden obligatorio (decisión pendiente):

1. Revisar y aplicar migraciones en un proyecto Supabase supervisado.
2. Desplegar la Edge Function firmante y probarla de extremo a extremo
   (sesión + derecho + admin).
3. Aplicar la configuración de Bunny en Supabase.
4. **Solo entonces** activar «Embed view token authentication» en la
   biblioteca de Bunny y vincular el vídeo definitivo.
5. Después de comprobar la reproducción real, activar el flag público
   `videoPlaybackBunny` en la configuración (o en `environment.local.ts` en
   desarrollo). Antes, el aula permanece en estado honesto sin Bunny.

Activar la opción antes de tiempo deja los vídeos inaccesibles: los embeds
sin token pasan a 403 al instante. Desactivarla no basta como marcha atrás
si ya hubo tráfico.

No es DRM: no impide grabar la pantalla y solo limita el enlace directo y su
reutilización tras caducar el token. No se promete protección absoluta.
