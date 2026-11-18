# Estado del formulario de vídeo en administración

Kimberley, resumen corto y honesto.

## Qué hay

- Edge Function `link-lesson-video` (**desplegada en DEV**): exige JWT
  verificado y rol `admin` en `public.user_roles`. Nunca lee `user_metadata`.
- El cuerpo acepta solo `{ lessonId, videoId }`. El library ID y la API key
  salen de los secretos de entorno `BUNNY_STREAM_LIBRARY_ID` y
  `BUNNY_STREAM_API_KEY`; sin ambos la función responde 503 antes de tocar
  nada. La API key nunca se registra ni se devuelve.
- Antes de escribir, la función consulta la ficha real del GUID en Bunny con
  `AccessKey`. Solo guarda `ready` si el estado es `Finished` y la duración es
  positiva; el resto se guarda como `pending`/`processing` o se rechaza.
- RPC `public.server_link_lesson_video` (migración `20261117260000`):
  `security definer`, solo `service_role`, vuelve a comprobar el rol, valida
  entradas y evita que un GUID quede en dos lecciones. La CHECK de
  `private.lesson_videos` ya admite `processing`.
- Formulario `/admin/:courseId/:lessonId/video` con estados
  `idle`/`validando`/`vinculado`/`error`/`sin-config`/`sin-video`. No carga
  ninguna ficha al montar; no muestra el GUID guardado ni metadatos privados.
- Hay enlace desde «Estructura» al vídeo de la lección, y la subida TUS está
  integrada en el inspector del panel (`video-upload`).

## Estado real y límites

- En DEV están aplicadas las migraciones y desplegadas las funciones; en
  producción nada de esto está aplicado. La configuración de servidor vive solo
  en secretos de Supabase.
- Token auth de Bunny **activo** en DEV. El modo sin firma está apagado por
  defecto: exige entorno explícitamente `development`/`dev` además del flag, y
  en producción se ignora (503 fail-closed).
- En DEV se verificó la configuración, la subida de un vídeo de prueba y la
  carga del reproductor; las pruebas automáticas usan mocks y GUID ficticios.
  No se afirma una reproducción E2E completa con Bunny más allá de lo verificado.
- No se promete protección absoluta ni DRM.

Los identificadores reales de la biblioteca y los vídeos son datos internos:
no se han pegado en el código de cliente, los fixtures ni esta nota.
