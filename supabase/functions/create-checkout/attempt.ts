/**
 * Réplica EXACTA, en servidor, del algoritmo puro de
 * `src/app/core/checkout/checkout.ts` (`canonicalAttemptId` +
 * `checkoutFingerprint`). No es criptografía: es un seudónimo determinista para
 * derivar la clave de idempotencia y el intento de la base de datos a partir de
 * la identidad autenticada y el curso. Nunca se lee del cuerpo de la petición.
 *
 * Los intentos ya emitidos por el cliente conservan su UUID: cualquier cambio
 * de estos primitivos rompería la idempotencia de pagos anteriores.
 */

/** Mismo primitivo BigInt, mismas constantes y mismo orden de operaciones. */
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
 * Intento canónico derivado SOLO de hechos del servidor: identidad verificada
 * (`auth.uid()`) y curso. El `attemptId` del cuerpo se ignora por completo.
 * Futuro: si entran `offerKind`/`offerId`, se añaden aquí y en el cliente a la vez.
 */
export function canonicalAttemptId(userId: string, courseId: string): string {
  return checkoutFingerprint(`${userId.trim().toLowerCase()}:${courseId.trim().toLowerCase()}`);
}
