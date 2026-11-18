/**
 * Plantilla de configuración local de Supabase.
 *
 * Copia este archivo a `environment.local.ts` (ignorado por Git) y rellena los
 * valores del proyecto de desarrollo. La URL y la publishable key son públicas
 * por diseño y llegan al navegador; no escribas aquí `service_role`, la
 * contraseña de la base de datos ni ninguna clave secreta.
 *
 * `npm run config:init` crea `environment.local.ts` a partir de esta plantilla
 * si todavía no existe. Nunca sobrescribe una copia existente.
 */
export const environmentLocal = {
  supabaseUrl: '',
  supabasePublishableKey: '',
  // Una sola variable para el vídeo: `false` = maquetación YouTube local en
  // desarrollo (requiere el mapa de `video-demo.local.ts`; sin él no carga nada);
  // `true` = reproducción Bunny con firma emitida en servidor. Por defecto
  // `false`, sin secretos ni IDs de vídeo en el cliente.
  videoPlaybackBunny: false,
  // Solo muestra la UI de la compra TEST: no habilita cobros ni accesos, que
  // siguen dependiendo del gate del servidor. `false` por defecto.
  checkoutTestEnabled: false,
  // ID público de GA4. Puede ser la misma propiedad del dominio principal y del
  // subdominio. Vacío = analítica desactivada: no se carga ningún script. No es
  // un secreto, pero se rellena solo en la copia local/entorno de producción
  // cuando se decida la propiedad. Sin GTM ni AdSense.
  analyticsMeasurementId: '',
  // Dominio compartido para la cookie de consentimiento y para GA4. Vacío =
  // solo localStorage y sin `cookie_domain` (comportamiento automático). Si la
  // academia vive en un subdominio, se rellena con el dominio raíz con punto
  // delante, p. ej. '.acordesgaditanos.com' cuando se cierre el dominio D9.
  // Solo se escribe aquí en la copia ignorada; no es un secreto.
  analyticsCookieDomain: '',
};
