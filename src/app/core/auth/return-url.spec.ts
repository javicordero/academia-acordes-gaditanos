import { Router } from '@angular/router';

import {
  requestedLoginReturnUrl,
  safeLoginReturnUrl,
  sanitizeReturnUrl,
} from './return-url';

/** Las UrlTree se representan como texto: serializeUrl solo las devuelve. */
function fakeRouter(
  navigation: { extractedUrl?: string; finalUrl?: string } | null,
  url = '/',
): Router {
  return {
    url,
    currentNavigation: () => navigation,
    serializeUrl: (tree: unknown) => tree as string,
  } as unknown as Router;
}

describe('returnUrl seguro', () => {
  it('acepta rutas internas y conserva consulta y fragmento', () => {
    expect(sanitizeReturnUrl('/mis-cursos?curso=abc#leccion')).toBe(
      '/mis-cursos?curso=abc#leccion',
    );
  });

  it('rechaza URLs externas y rutas protocol-relative', () => {
    expect(sanitizeReturnUrl('https://ejemploexterno.invalid')).toBeNull();
    expect(sanitizeReturnUrl('//ejemploexterno.invalid/ruta')).toBeNull();
    expect(sanitizeReturnUrl('javascript:alert(1)')).toBeNull();
  });

  it('rechaza barras invertidas y caracteres de control', () => {
    expect(sanitizeReturnUrl('/\\ejemploexterno.invalid')).toBeNull();
    expect(sanitizeReturnUrl('/ruta\nmaliciosa')).toBeNull();
    expect(sanitizeReturnUrl(null)).toBeNull();
  });

  it('evita volver a las pantallas de autenticación desde login', () => {
    expect(safeLoginReturnUrl('/auth/login')).toBeNull();
    expect(safeLoginReturnUrl('/auth/callback?code=abc')).toBeNull();
    expect(safeLoginReturnUrl('/admin')).toBe('/admin');
  });
});

describe('returnUrl de la navegación en curso', () => {
  it('toma la ruta solicitada, no la anterior de router.url', () => {
    expect(requestedLoginReturnUrl(fakeRouter({ finalUrl: '/admin' }))).toBe('/admin');
    expect(
      requestedLoginReturnUrl(
        fakeRouter({ finalUrl: '/mis-cursos?curso=abc#leccion' }, '/'),
      ),
    ).toBe('/mis-cursos?curso=abc#leccion');
  });

  it('usa extractedUrl si finalUrl aún no está disponible', () => {
    expect(requestedLoginReturnUrl(fakeRouter({ extractedUrl: '/admin' }))).toBe('/admin');
  });

  it('recurre a router.url solo si no hay navegación en curso', () => {
    expect(requestedLoginReturnUrl(fakeRouter(null, '/perfil'))).toBe('/perfil');
  });

  it('rechaza destinos externos y pantallas de autenticación', () => {
    expect(requestedLoginReturnUrl(fakeRouter({ finalUrl: '//externo.invalid' }))).toBeNull();
    expect(requestedLoginReturnUrl(fakeRouter({ finalUrl: '/auth/login' }))).toBeNull();
  });
});
