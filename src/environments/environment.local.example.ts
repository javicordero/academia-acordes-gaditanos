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
};
