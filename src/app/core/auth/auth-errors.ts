/**
 * Traduce errores de Supabase Auth a mensajes en español sin reutilizar textos
 * crudos del proveedor ni revelar si un correo está registrado.
 */
export function authErrorMessage(error: unknown): string {
  const code = readStringProperty(error, 'code')?.toLowerCase() ?? '';
  const status = readNumberProperty(error, 'status');

  if (code === 'invalid_credentials') {
    return 'Correo o contraseña incorrectos.';
  }

  if (code === 'email_not_confirmed') {
    return 'Tu correo aún no está confirmado. Revisa el mensaje de confirmación.';
  }

  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    code === 'too_many_requests' ||
    status === 429
  ) {
    return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
  }

  if (code === 'weak_password') {
    return 'La contraseña no cumple la política del servicio de cuentas.';
  }

  if (code === 'same_password') {
    return 'La nueva contraseña debe ser distinta de la actual.';
  }

  if (
    code === 'otp_expired' ||
    code === 'flow_state_expired' ||
    code === 'flow_state_not_found' ||
    code === 'bad_code_verifier'
  ) {
    return 'El enlace ha caducado o no es válido. Solicita uno nuevo.';
  }

  if (code === 'user_already_exists' || code === 'email_exists') {
    return 'No se pudo completar el registro con esos datos. Prueba a iniciar sesión o recuperar la contraseña.';
  }

  if (code === 'session_not_found' || code === 'refresh_token_not_found') {
    return 'La sesión ha caducado. Vuelve a iniciar sesión.';
  }

  if (code === 'signup_disabled') {
    return 'El registro de cuentas está desactivado en este momento.';
  }

  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

function readStringProperty(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : null;
}

function readNumberProperty(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'number' ? property : null;
}
