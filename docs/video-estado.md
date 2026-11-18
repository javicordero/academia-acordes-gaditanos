# Estado del vídeo (Bunny Stream)

Registro breve del estado real. Sin claves, sin valores de configuración.
La decisión de proveedor vive en `docs/decisiones-producto.md` (2026-11-18).

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

## Cliente Angular (código local, no desplegado)

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

## Qué NO está hecho

- **Nada aplicado en la nube**: no hay proyecto Supabase remoto migrado.
- Las Edge Functions (`lesson-video-token`, `link-lesson-video`) están
  versionadas con pruebas con mocks, pero **no desplegadas ni probadas en real**.
- **Token authentication de Bunny no está activado** en la biblioteca.
- **`COLGAOS` no está vinculado** aún a la primera lección del curso real.
- Secretos de Bunny (Library API key y signing key) no configurados: van a
  mano como secretos de Edge Functions, nunca al repositorio, al chat,
  `environment.local.ts` ni a filas públicas.
- La UI del aula todavía dice «Vídeo de ejemplo»/«YouTube»: queda como
  pendiente de UI rotular el proveedor real y su caducidad.

## Gate: orden obligatorio

1. Revisar y aplicar migraciones en un proyecto Supabase supervisado.
2. Desplegar la Edge Function firmante y probarla de extremo a extremo
   (sesión + derecho + admin).
3. Configurar a mano los secretos de Bunny en Supabase.
4. **Solo entonces** activar «Embed view token authentication» en la
   biblioteca de Bunny y vincular `COLGAOS`.
5. Después de comprobar la reproducción real, activar el flag público
   `videoPlaybackBunny` en la configuración (o en `environment.local.ts` en
   desarrollo). Antes, el aula permanece en estado honesto sin Bunny.

Activar la opción antes de tiempo deja los vídeos inaccesibles: los embeds
sin token pasan a 403 al instante. Desactivarla no basta como marcha atrás
si ya hubo tráfico.

No es DRM: no impide grabar la pantalla y solo limita el enlace directo y su
reutilización tras caducar el token. No se promete protección absoluta.
