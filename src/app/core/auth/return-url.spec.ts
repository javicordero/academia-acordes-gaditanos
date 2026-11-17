import {
  safeLoginReturnUrl,
  sanitizeReturnUrl,
} from './return-url';

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
