# Estado del formulario de vídeo en administración

Kimberley, resumen corto y honesto.

## Qué hay

- Edge Function `link-lesson-video` (local, **no desplegada**): exige JWT
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

## Qué NO está hecho

- Nada de esto está aplicado en la nube: ni migraciones, ni funciones, ni
  secretos configurados en Supabase.
- No se ha probado el vídeo real desde la aplicación; las pruebas son locales
  con mocks y GUID ficticios.
- El token auth de Bunny sigue **OFF**. No se activa hasta desplegar y probar
  `lesson-video-token`; activarlo antes deja los embeds sin token en 403.
- No hay enlace desde «Estructura» al formulario: se accede por URL directa
  mientras se integra el panel editorial definitivo.
- No se promete protección absoluta ni DRM.

Los identificadores reales de la biblioteca y los vídeos son datos internos:
no se han pegado en el código de cliente, los fixtures ni esta nota.
