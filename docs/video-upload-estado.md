# Estado de la subida de vídeo desde administración (backend)

Registro técnico y honesto. El **backend** (migración `20261118140000` y Edge
Function `video-upload`) fue desplegado en **DEV desde el commit `15036ab`** por
el operador de nube; no se ha aplicado a producción. El estado remoto comprobado
se detalla más abajo. La **interfaz local** está integrada en el inspector del
panel; en DEV se subió un vídeo de prueba, sin afirmar una carga de extremo a
extremo completa. No se ha creado ningún objeto en Bunny con datos reales, no
se ha contratado nada y las decisiones comerciales (precio, duración del acceso,
política de reembolsos) siguen pendientes.

## Estado remoto comprobado (DEV)

Verificado por el operador de nube sobre el despliegue del commit `15036ab`:

- Migración `20261118140000_video_upload.sql` aplicada en DEV; las seis RPC
  (`video_upload_status`, `video_upload_reserve`, `video_upload_attach`,
  `video_upload_refresh`, `video_upload_sync`, `video_upload_mark_review`)
  ejecutables solo por `service_role`, con RLS en `private.video_upload_jobs`
  sin políticas para `anon`/`authenticated`.
- CORS: `OPTIONS` desde un origen permitido → 204 con ACAO; origen externo →
  403; petición sin JWT → 401.
- No se enviaron archivos reales: no hubo `prepare`, `refresh` ni subida de
  bytes, y la tabla privada de trabajos quedó vacía (0 filas).
- No hay prueba E2E con Bunny real: creación de objetos, subida TUS, caducidad
  del recurso y codificación siguen sin verificarse en remoto.

## Contrato de la Edge Function `video-upload`

Se invoca con `functions.invoke('video-upload', { body })` desde una sesión real
de Supabase Auth. Solo `POST`; `OPTIONS` responde al preflight. Cabeceras de
respuesta: `Cache-Control: no-store`, `Pragma: no-cache`, `Vary: Origin` y
`Access-Control-Allow-Origin` **solo** si el `Origin` está en la allowlist. Sin
`Origin` la petición funciona, pero no se emite ACAO. Nunca se usa wildcard ni
credenciales CORS.

La comprobación es: origen → configuración → JWT verificado con `auth.getUser`
→ rol `admin` consultado en `public.user_roles` → cuerpo → proveedor. Las rutas y los guards de Angular no son barrera de seguridad.

### `status`

```json
{ "action": "status", "lessonId": "<uuid>", "uploadId": "<uuid opcional>" }
```

Respuesta:

```json
{
  "state": "none | pending | uploading | processing | ready | failed | blocked",
  "uploadId": "<uuid>",
  "hasVideo": false,
  "durationSeconds": 90,
  "limits": { "maxBytes": 1073741824, "allowedMimeTypes": ["video/mp4"] },
  "notice": "texto opcional"
}
```

- No crea nada, no firma nada y **no devuelve GUID, library ni claves**.
- `none` y `ready` no consultan a Bunny. Solo con trabajo propio activo y GUID
  se hace un `GET` a Bunny y se aplica el estado oficial con CAS sobre ese GUID.
- `uploadId` aparece cuando hay trabajo; en `ready` se omite. Si se envía un
  `uploadId` ajeno al trabajo actual se responde 409 sin consultar al proveedor.
- `durationSeconds` solo aparece si Bunny lo devolvió; nunca se fía del cliente.

### `prepare`

```json
{
  "action": "prepare",
  "lessonId": "<uuid>",
  "requestId": "<uuid>",
  "fileName": "clip.mp4",
  "fileSize": 1048576,
  "mimeType": "video/mp4"
}
```

Solo se llama por clic en «Subir». Valida que la lección sea `content_type =
'video'`, tamaño y MIME declarados, y un nombre sin separadores ni caracteres de
control (máx. 120 caracteres). El cuerpo entero está limitado a 8 KiB.

Respuesta (credencial TUS temporal, **solo para administrador verificado**):

```json
{
  "uploadId": "<uuid>",
  "endpoint": "https://video.bunnycdn.com/tusupload",
  "libraryId": "<id de biblioteca>",
  "videoId": "<guid>",
  "expiresAt": 1800003600,
  "signature": "<sha256 de 64 hex>",
  "limits": { "maxBytes": 1073741824, "allowedMimeTypes": ["..."] }
}
```

- `requestId` identifica un único envío. El mismo `requestId` con los mismos
  atributos devuelve la grant del **mismo GUID** y no crea otro objeto. Cambiar
  lección, tamaño, nombre o MIME → 409.
- Se reserva el trabajo privado **antes** del `POST` de creación. Un segundo
  trabajo activo para la misma lección → 409. Si no hay GUID confirmado tras una
  creación ambigua, se responde 409 y **no se reintenta automáticamente**.
- Si la lección ya tiene vídeo `ready` o el GUID pertenece a otro trabajo, se
  responde 409 sin sobrescribir nada.
- `POST https://video.bunnycdn.com/library/{libraryId}/videos` con cabecera
  `AccessKey` y cuerpo `{ "title": ... }` ocurre solo en servidor.
- Firma: `SHA256(libraryId + BUNNY_STREAM_API_KEY + expiresAt + videoId)` con
  Web Crypto. No es la signing key de reproducción. Ni la API key ni la signing
  key aparecen en la respuesta, en logs ni en el cliente.
- Alcance de la firma: cubre solo el GUID del vídeo, la biblioteca y la
  caducidad; **no liga criptográficamente** el tamaño, el nombre ni el MIME
  declarados. Esos valores se comprueban en la UI y de nuevo en el servidor
  antes de autorizar, y la grant se entrega solo a un administrador real
  verificado. El tope de 1 GiB es una salvaguarda sobre lo declarado y sobre el
  cuerpo de la petición, **no una barrera infranqueable** en la subida directa
  TUS: el proveedor procesa y codifica el formato final. No hay API keys, IDs ni
  firmas reales en este documento, ni promesa de coste absoluto.
- Un fallo de creación se marca para revisión y responde 502 genérico. No se
  borra el objeto huérfano posible: podría contener vídeo del usuario.

### `refresh`

```json
{ "action": "refresh", "lessonId": "<uuid>", "uploadId": "<uuid>" }
```

Devuelve la misma forma que `prepare` más un `notice`. Vuelve a firmar **el
mismo GUID** de un trabajo activo que no esté listo; no crea ningún objeto y
responde 409 si el trabajo ya terminó, es ajeno o no está activo. Según la
documentación oficial de Bunny, re-firmar permite reanudar pero **no extiende**
la vida del recurso TUS; el aviso lo dice explícitamente. No hay sustitución de
vídeo ni borrado.

## Estados de Bunny aplicados (documentación oficial consultada)

`0` Created → `pending`; `1` Uploaded, `2` Processing, `3` Transcoding, `7`
JitSegmenting, `8` JitPlaylistsCreated → `processing`; `4` Finished → `ready`
**solo con duración positiva real**; `5` Error y `6` UploadFailed → `failed`;
cualquier otro valor → `blocked` para revisión. El 100 % de bytes transferidos
(`1`) no se considera `ready`. `finished` con duración 0 tampoco.

El enlace TUS es fijo: `https://video.bunnycdn.com/tusupload`. Las cabeceras que
debe enviar el cliente TUS son `AuthorizationSignature`, `AuthorizationExpire`,
`LibraryId` y `VideoId`, con metadata `filetype` y `title`. El adaptador solo
construye URLs de `https://video.bunnycdn.com` y verifica el hostname antes de
llamar a `fetch`.

## Base de datos

Migración `20261118140000_video_upload.sql`, prueba `0020_video_upload.psql`.

- `private.video_upload_jobs`: RLS sin políticas (denegación por defecto), ACL
  solo para `service_role`, `search_path = ''`, identificadores y atributos del
  archivo, GUID y library solo en servidor. Sin correos ni otros datos personales.
- RPC `public.video_upload_status`, `video_upload_reserve`, `video_upload_attach`,
  `video_upload_refresh`, `video_upload_sync` y `video_upload_mark_review`:
  `security definer`, solo `service_role`, rol admin vuelto a comprobar en BD.
- Un único trabajo activo por lección; `request_id` único; GUID único entre
  trabajos. `attach` y `sync` son CAS: nunca reemplazan un GUID ajeno ni un vídeo
  `ready`. El enlace final a `private.lesson_videos` es `INSERT ... ON CONFLICT
  DO NOTHING`. No se tocan `public.lessons` ni `lesson_progress`.
- No hay borrado ni DELETE: un problema ambiguo queda marcado para revisión
  humana. Cancelar en el cliente solo detiene el envío; no destruye contenido.

## Configuración del servidor (solo entorno de la Edge Function)

| Variable | Uso | Por defecto |
| --- | --- | --- |
| `BUNNY_STREAM_LIBRARY_ID` | Library numérico | ausente ⇒ 503 |
| `BUNNY_STREAM_API_KEY` | API key para crear vídeo y firmar TUS | ausente ⇒ 503 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Auth y RPCs | ausentes ⇒ 503 |
| `VIDEO_UPLOAD_ALLOWED_ORIGINS` | orígenes exactos, separados por coma | `http://localhost:4200` |
| `VIDEO_UPLOAD_MAX_BYTES` | salvaguarda técnica | 1073741824 (1 GiB) |
| `BUNNY_UPLOAD_AUTH_TTL_SECONDS` | validez de la firma TUS | 3600 s |

`VIDEO_UPLOAD_MAX_BYTES` se fija entre 1024 y 1 GiB; `BUNNY_UPLOAD_AUTH_TTL_SECONDS`
entre 3600 y 86400 s. Bunny exige al menos 3600 s. Estos topes son seguridad
técnica y documentación del límite, **no** una política comercial ni una
promesa de almacenamiento ilimitado. El módulo `index.ts` carga aunque no haya
configuración y responde 503; sin secretos no se firma ni se crea nada.

## Verificación y límites

- `npm run test:functions`: 31 pruebas nuevas con mocks (autorización y origen,
  validación, idempotencia, firma independiente SHA-256, `refresh` sin nueva
  creación, estados del proveedor y URLs con hostname fijo). `npm run test:sql`:
  transacción con `ROLLBACK`, RLS por defecto, ACL, CAS y sin cambios de
  publicación ni progreso. No son pruebas E2E.
- Las pruebas locales no usan Supabase local (Docker + CLI), PostgREST real ni
  peticiones a Bunny. El despliegue DEV existe, pero no se ha ejercitado con
  archivos reales: la creación y la subida real, la caducidad del recurso TUS y
  la codificación efectiva quedan por verificar con autorización.
- La interfaz de administración y su integración con este contrato se coordinan
  por separado; este documento no crea UI ni toca el repositorio del cancionero.
- No se promete protección absoluta del vídeo ni DRM. Bunny tiene coste variable;
  nada se contrata sin autorización explícita.
