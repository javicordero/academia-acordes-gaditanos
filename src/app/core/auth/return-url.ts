import { Router } from '@angular/router';

/**
 * Devuelve una ruta interna segura o `null`.
 *
 * Rechaza URLs absolutas, rutas protocol-relative (`//dominio`), barras
 * invertidas, caracteres de control y cualquier valor que cambie de origen al
 * resolverlo. Así un `returnUrl` manipulado no puede abrir un sitio externo.
 */
export function sanitizeReturnUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const candidate = value.trim();

  if (!candidate.startsWith('/') || candidate.startsWith('//')) {
    return null;
  }

  if (candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return null;
  }

  try {
    const base = 'https://internal.invalid';
    const parsed = new URL(candidate, base);

    if (parsed.origin !== base) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * Igual que `sanitizeReturnUrl`, pero evita volver a las propias pantallas de
 * autenticación y crear un bucle de redirecciones.
 */
export function safeLoginReturnUrl(
  value: string | null | undefined,
): string | null {
  const safe = sanitizeReturnUrl(value);

  if (!safe || safe === '/auth' || safe.startsWith('/auth/')) {
    return null;
  }

  return safe;
}

/**
 * URL objetivo de la navegación en curso, saneada para usarla como returnUrl.
 *
 * Mientras se ejecuta un guard, `router.url` sigue apuntando a la ruta anterior
 * (en la carga inicial, `/`), así que propagarlo devolvería siempre al inicio.
 * `currentNavigation()` expone la ruta solicitada: `finalUrl` tras redirecciones
 * internas y `extractedUrl` como respaldo. Nunca se acepta una URL externa.
 */
export function requestedLoginReturnUrl(router: Router): string | null {
  const navigation = router.currentNavigation();
  const target = navigation?.finalUrl ?? navigation?.extractedUrl;

  return safeLoginReturnUrl(target ? router.serializeUrl(target) : router.url);
}
