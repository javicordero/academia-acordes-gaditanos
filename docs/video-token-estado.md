# Estado del token de vídeo (Edge Function `lesson-video-token`)

Nota técnica breve, sin claves ni datos personales. La decisión de proveedor y
el estado general del vídeo están en `docs/decisiones-producto.md` y
`docs/video-estado.md`.

## Contrato actual

La función sigue exigiendo **sesión verificada y derecho activo** (o rol admin
para vista previa) antes de emitir nada. La autorización real está en la RPC de
servidor y en RLS; el modo descrito abajo no la relaja.

Estado comprobado hoy: el servidor firma con `BUNNY_STREAM_TOKEN_AUTH_KEY`,
`BUNNY_ALLOW_UNSIGNED_EMBED` está desactivado y la autenticación por token de
Bunny está activa. La comprobación se limitó a la configuración y a la carga del
reproductor; no equivale a una reproducción completa de principio a fin.

- Con `BUNNY_STREAM_TOKEN_AUTH_KEY` configurada: se firma exactamente como
  siempre. La respuesta 200 es `{ embedUrl, expiresAt, notice }`, con `token` y
  `expires` dentro de la URL y `expiresAt` en segundos Unix. No cambia nada.
- Sin clave y con el flag en OFF (valor por defecto): **503 fail-closed**, con
  un `notice` que no revela secretos. Es el comportamiento normal y el único
  permitido en producción.
- Sin clave y con el flag DEV activo: respuesta 200
  `{ embedUrl, expiresAt: 0, notice, unsigned: true }`. La URL es
  `https://player.mediadelivery.net/embed/{library}/{guid}`, sin `token` ni
  `expires`. La biblioteca y el GUID siguen validados (1–12 dígitos y UUID).
  La clave y el nombre del flag nunca se devuelven ni se registran en logs.

`expiresAt: 0` significa **sin caducidad**, no «caducado». El adaptador Angular
acepta ese caso solo cuando `unsigned === true`: convierte `expiresAt` a `null`,
no programa temporizador y muestra el `notice` del servidor sin estado
`expired`. Cualquier otra combinación (0 sin `unsigned`, `unsigned` con fecha
futura) se rechaza y el reproductor no se monta.

## Modo sin caducidad: cuándo usarlo

Solo en **desarrollo**, con un interruptor explícito del servidor:

```
BUNNY_ENVIRONMENT=development
BUNNY_ALLOW_UNSIGNED_EMBED=1
```

El valor del flag debe ser exactamente `1`; cualquier otro valor (incluido no
definirlo) deja el modo desactivado. Además, `BUNNY_ENVIRONMENT` debe ser
exactamente `development` o `dev`: si falta (por defecto `production`) o tiene
otro valor, el flag se ignora y la función responde 503. Sirve únicamente para
comprobar el vídeo real de una biblioteca DEV cuando el «Embed view token
authentication» de Bunny está
desactivado y todavía no se ha copiado la signing key a Supabase. Es una
excepción temporal de maquetación, no una forma de eludir la firma: el enlace no
caduca y se puede compartir, y no es DRM ni impide grabar la pantalla.

Para volver a la operación normal, en cuanto la firma esté disponible:

1. Copiar la **signing key** de la biblioteca de Bunny a los secretos de la Edge
   Function en Supabase, como `BUNNY_STREAM_TOKEN_AUTH_KEY` (junto a
   `BUNNY_STREAM_LIBRARY_ID` si aún no está).
2. Quitar `BUNNY_ALLOW_UNSIGNED_EMBED` (o ponerlo a `0`) en el entorno de la
   función y volver a desplegarla.
3. Activar «Embed view token authentication» en la biblioteca de Bunny **solo
   después** de que la función firme y se haya probado una reproducción real.
   Activarlo antes deja los embeds sin token en 403.

## Producción

En producción **`BUNNY_ALLOW_UNSIGNED_EMBED` debe estar OFF** y la signing key
configurada en el servidor. `BUNNY_ENVIRONMENT` ausente o distinto de
`development`/`dev` equivale a producción: aunque el flag valga `1`, la función
responde 503. Nunca se concede acceso sin firma por defecto; el aula muestra un
estado honesto. La clave de firma y la API key de Bunny viven solo como secretos de
Edge Functions en Supabase: no se escriben en el repositorio, en
`environment.local.ts`, en el chat ni en filas públicas.

## Orígenes permitidos (CORS)

La función solo refleja `Access-Control-Allow-Origin` para orígenes explícitos.
Se configuran en `VIDEO_TOKEN_ALLOWED_ORIGINS` como una lista separada por
comas; si la variable no está definida, el origen permitido por defecto es
`http://localhost:4200`. No se admiten comodines (`*`) y esta lista no relaja
la autenticación ni las políticas RLS: la sesión y el derecho se siguen
comprobando en el servidor.

Para pruebas desde otro dispositivo (por ejemplo, a través de Tailscale) se
añade el origen de desarrollo concreto, sin sustituir el de localhost:

```
VIDEO_TOKEN_ALLOWED_ORIGINS=http://localhost:4200,http://<ip-tailscale>:4200
```

`<ip-tailscale>` es un marcador de posición: la IP real solo se usa en el
entorno de desarrollo, nunca en el repositorio. Los orígenes son datos públicos,
no secretos; las claves y el flag sin firma se configuran por separado, como se
describe arriba.
