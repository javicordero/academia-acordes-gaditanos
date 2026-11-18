import {
  BUNNY_TUS_ENDPOINT,
  fileSeed,
  fileValidationError,
  resolveBunnyTusResumeUrl,
  stableRequestId,
  statusMessage,
  uploadHttpMessage,
  validateGrant,
  validateStatus,
} from './video-upload-contract';

const NOW = 1_700_000_000;
const STATUS = {
  state: 'none',
  hasVideo: false,
  limits: { maxBytes: 1_000_000, allowedMimeTypes: ['video/mp4'] },
};

function grant(overrides: Record<string, unknown> = {}): unknown {
  return {
    uploadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    endpoint: BUNNY_TUS_ENDPOINT,
    libraryId: '123456',
    videoId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expiresAt: NOW + 3600,
    signature: 'firma-ficticia',
    limits: STATUS.limits,
    ...overrides,
  };
}

describe('video-upload-contract', () => {
  it('acepta un status válido y rechaza estados o límites mal formados', () => {
    expect(validateStatus(STATUS)).toEqual(STATUS);
    expect(validateStatus({ ...STATUS, state: 'inventado' })).toBeNull();
    expect(validateStatus({ ...STATUS, hasVideo: 'true' })).toBeNull();
    expect(validateStatus({ ...STATUS, limits: { maxBytes: -1, allowedMimeTypes: [] } })).toBeNull();
    expect(validateStatus({ ...STATUS, uploadId: 'no-uuid' })).toBeNull();
    expect(validateStatus(null)).toBeNull();
  });

  it('no conserva el notice del servidor y solo expone mensajes fijos por estado', () => {
    const parsed = validateStatus({ ...STATUS, state: 'failed', notice: 'https://x?token=SECRETO' });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('notice');
    expect(statusMessage(parsed!)).toBe('El proveedor informó de un error en el vídeo. No se ha borrado nada; revisa el estado.');
    for (const state of ['none', 'pending', 'uploading', 'processing', 'ready', 'failed', 'blocked'] as const) {
      const text = statusMessage({ ...STATUS, state });
      expect(text).not.toMatch(/https?:|token=|signature=|SECRETO/i);
    }
  });

  it('acepta una concesión válida y rechaza endpoint arbitrario y firma caducada', () => {
    expect(validateGrant(grant(), NOW)).not.toBeNull();
    expect(validateGrant(grant({ endpoint: 'https://malicioso.example/tus' }), NOW)).toBeNull();
    expect(validateGrant(grant({ endpoint: 'http://video.bunnycdn.com/tusupload' }), NOW)).toBeNull();
    expect(validateGrant(grant({ expiresAt: NOW - 1 }), NOW)).toBeNull();
    expect(validateGrant(grant({ signature: '' }), NOW)).toBeNull();
    expect(validateGrant(grant({ videoId: 'no-uuid' }), NOW)).toBeNull();
    expect(validateGrant(grant({ uploadId: undefined }), NOW)).toBeNull();
  });

  it('el requestId es estable para la misma semilla y UUID con versión/variante', () => {
    const a = stableRequestId('leccion|archivo.mp4|10|video/mp4|1');
    const b = stableRequestId('leccion|archivo.mp4|10|video/mp4|1');
    const c = stableRequestId('otra|archivo.mp4|10|video/mp4|1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('la huella separa lección, GUID y propiedades del archivo', () => {
    const file = new File(['x'], 'leccion.mp4', { type: 'video/mp4', lastModified: 5 });
    expect(fileSeed('leccion-1', 'guid-1', file)).toContain('leccion-1');
    expect(fileSeed('leccion-1', 'guid-1', file)).not.toBe(fileSeed('leccion-2', 'guid-1', file));
    expect(fileSeed('leccion-1', 'guid-1', file)).not.toBe(fileSeed('leccion-1', 'guid-2', file));
  });

  it('valida tamaño y tipo con los límites del servidor', () => {
    const limits = { maxBytes: 100, allowedMimeTypes: ['video/mp4'] };
    expect(fileValidationError(null, limits)).toContain('Selecciona');
    expect(fileValidationError(new File(['x'], 'a.mp4', { type: 'video/mp4' }), null)).toContain('límites');
    expect(fileValidationError(new File([new Uint8Array(101)], 'a.mp4', { type: 'video/mp4' }), limits)).toContain('tamaño');
    expect(fileValidationError(new File(['x'], 'a.txt', { type: 'text/plain' }), limits)).toContain('tipo');
    expect(fileValidationError(new File(['x'], 'a.mp4', { type: 'video/mp4' }), limits)).toBeNull();
  });

  it('resuelve solo URLs TUS oficiales para reanudar (absolutas o relativas)', () => {
    const official = 'https://video.bunnycdn.com/tusupload/abc-123';
    expect(resolveBunnyTusResumeUrl(official)).toBe(official);
    expect(resolveBunnyTusResumeUrl('/tusupload/abc-123')).toBe(official);
    expect(resolveBunnyTusResumeUrl('abc-123')).toBe(official);
    expect(resolveBunnyTusResumeUrl('https://video.bunnycdn.com:443/tusupload/abc-123')).toBe(official);

    const rejected = [
      'https://evil.example/tusupload/abc-123',
      'https://user:pass@video.bunnycdn.com/tusupload/abc-123',
      'https://video.bunnycdn.com@evil.example/tusupload/abc-123',
      'http://video.bunnycdn.com/tusupload/abc-123',
      'https://video.bunnycdn.com:8443/tusupload/abc-123',
      'https://video.bunnycdn.com/otro/abc-123',
      'https://video.bunnycdn.com/tusupload/../abc-123',
      'https://video.bunnycdn.com/tusupload/abc-123?token=x',
      'https://video.bunnycdn.com/tusupload/abc-123#frag',
      'javascript:alert(1)',
      'data:text/plain,x',
      'https://video.bunnycdn.com.evil.example/tusupload/abc-123',
      'https://video.bunnycdn.com/tusupload/%2e%2e/abc',
      '',
    ];
    for (const value of rejected) expect(resolveBunnyTusResumeUrl(value)).toBeNull();
    expect(resolveBunnyTusResumeUrl(123)).toBeNull();
    expect(resolveBunnyTusResumeUrl(null)).toBeNull();
  });

  it('mensajes de error honestos para 401, 409, 502 y red', () => {
    expect(uploadHttpMessage(401)).toContain('Inicia sesión');
    expect(uploadHttpMessage(409)).toContain('no se ha creado otro');
    expect(uploadHttpMessage(502)).toContain('proveedor');
    expect(uploadHttpMessage(null)).toContain('conectar');
    expect(uploadHttpMessage(418)).not.toMatch(/secret|key|http|signature|token/i);
  });
});
