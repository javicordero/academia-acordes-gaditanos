import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** Mismo formato de UUID que valida el servidor al reservar el pedido. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CHECKOUT_TEST_NOTICE = 'Modo de prueba — no se realizan cobros reales';
export const CHECKOUT_TEST_BUTTON = 'Comprar — modo prueba';

export type CheckoutFailureCode =
  | 'login'
  | 'forbidden'
  | 'unavailable'
  | 'status-unknown'
  | 'network'
  | 'unknown';

export interface CheckoutFailure {
  readonly code: CheckoutFailureCode;
  readonly retryable: boolean;
}

export type CheckoutStartResult =
  | {
      readonly kind: 'ok';
      readonly url: string;
      readonly sessionId?: string;
      readonly attemptId?: string;
    }
  | { readonly kind: 'failure'; readonly failure: CheckoutFailure };

/** Navegación inyectable: misma pestaña, sin popups y sin fallback en tests. */
export interface CheckoutNavigator {
  go(url: string): void;
}

export const CHECKOUT_NAVIGATOR = new InjectionToken<CheckoutNavigator>(
  'CHECKOUT_NAVIGATOR',
  {
    providedIn: 'root',
    factory: () => {
      const document = inject(DOCUMENT);
      return { go: (url) => document.defaultView?.location.assign(url) };
    },
  },
);

export function isCheckoutUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Huella determinista y PURA (mismo primitivo BigInt que el intento canónico).
 * NO es criptográfica ni SHA-256: es un seudónimo local de aislamiento entre
 * cuentas del mismo navegador, nunca una credencial ni una comprobación de
 * Auth. Funciona igual en HTTP no seguro, donde no existe `crypto.subtle`.
 */
function checkoutFingerprint(input: string): string {
  const prime = 0x01000193n;
  const mask = 0xffffffffn;
  let a = 0x811c9dc5n;
  let b = 0x9e3779b9n;

  for (const char of input) {
    const code = BigInt(char.codePointAt(0) ?? 0);
    a = ((a ^ code) * prime) & mask;
    b = ((b + code + (a << 5n) + (a >> 2n)) * prime) & mask;
  }

  const parts = [
    a,
    ((a ^ (a >> 16n)) * prime) & mask,
    b,
    ((b ^ (b >> 16n)) * 0x85ebca6bn) & mask,
  ];
  const hex = parts.map((part) => part.toString(16).padStart(8, '0')).join('');
  const bytes = Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5 (forma UUID, no seguridad)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const value = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

/**
 * Seudónimo de la cuenta para aislar el almacenamiento de recuperación. Dominio
 * distinto del intento (`owner:` vs `usuario:curso`) y sin WebCrypto: no es
 * secreto, no se envía al servidor y no sustituye al JWT.
 */
export function checkoutOwnerHash(userId: string): string {
  return checkoutFingerprint(`owner:${userId.trim().toLowerCase()}`);
}

/** Id opaco de sesión de Stripe: no es credencial, pero tampoco se adivina. */
const SESSION = /^cs_(?:test|live)_[A-Za-z0-9]+$/;

export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION.test(value);
}

/**
 * Acepta solo la URL real de Stripe Checkout: HTTPS estricto, host exacto, sin
 * credenciales y sin puerto alternativo. Se admiten paths y hash reales. Nunca
 * se registra la URL ni la respuesta bruta.
 */
export function isSafeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'checkout.stripe.com' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === ''
  );
}

/**
 * Intento canónico y determinista por curso + identidad. No se guarda en
 * almacenamiento (evita PII innecesaria): la misma acción produce siempre el
 * mismo UUID, incluso tras recargar o tras un fallo de red. El servidor deriva
 * su clave de idempotencia de este valor, así que un reintento no duplica la
 * sesión de pago; cambiar de cuenta o de curso produce otro intento.
 */
export function canonicalAttemptId(userId: string, courseId: string): string {
  // Misma entrada y mismo primitivo que antes de extraer `checkoutFingerprint`:
  // los intentos ya emitidos conservan su UUID y, por tanto, su clave de pago.
  return checkoutFingerprint(`${userId.trim().toLowerCase()}:${courseId.trim().toLowerCase()}`);
}

/** Clasifica el error sin leer ni registrar el cuerpo de la respuesta. */
export function classifyCheckoutError(error: unknown): CheckoutFailure {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;

  if (status === 401) return { code: 'login', retryable: false };
  if (status === 403) return { code: 'forbidden', retryable: false };
  if (status === 409) return { code: 'unavailable', retryable: false };
  // 422 = el servidor no pudo verificar el estado real de la sesión en Stripe.
  // Reintentar vuelve a preguntar; NUNCA implica abrir un intento nuevo.
  if (status === 422) return { code: 'status-unknown', retryable: true };

  const message = error instanceof Error ? error.message : '';
  if (/fetch|network|conexi|timeout|abort/i.test(message)) {
    return { code: 'network', retryable: true };
  }

  return { code: 'unknown', retryable: true };
}

export function checkoutErrorMessage(failure: CheckoutFailure): string {
  switch (failure.code) {
    case 'login':
      return 'Inicia sesión para continuar con la compra.';
    case 'forbidden':
      // 403 también puede ser origen no autorizado: no se afirma la causa.
      return 'No se pudo autorizar la compra en este momento.';
    case 'unavailable':
      return 'La compra no está disponible en este momento.';
    case 'status-unknown':
      return 'No se pudo confirmar el estado de la sesión en Stripe. Inténtalo de nuevo.';
    case 'network':
      return 'No se pudo conectar con el servidor de compras. Revisa tu conexión e inténtalo de nuevo.';
    case 'unknown':
      return 'No se pudo iniciar la compra. Inténtalo de nuevo.';
  }
}
