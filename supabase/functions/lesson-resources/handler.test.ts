import { describe, expect, it, vi } from 'vitest';
import { makeHandler } from './handler';
import { createDependencies } from './adapter';

const course = '10000000-0000-0000-0000-000000000001';
const lesson = '30000000-0000-0000-0000-000000000001';
const resource = '40000000-0000-0000-0000-000000000001';
const path = `${course}/${lesson}/${resource}/file.pdf`;
const row = { id: resource, title: 'PDF ficticio', kind: 'pdf', bucket: 'lesson-pdfs', path };
function setup(authenticated = true, allowed = true) {
  const io = {
    getUser: vi.fn(async (_token: string) => authenticated ? 'verified-user' : null),
    resources: vi.fn(async (_user: string, _lesson: string) => allowed ? { course_id: course, items: [row] } : null),
    sign: vi.fn(async (_path: string, _ttl: number, _filename: string) => 'https://storage.example.test/signed'),
    reserve: vi.fn(async (_user: string, _lesson: string, _id: string, _title: string, _fileName: string, _size: number, _mime: string): Promise<{course_id: string} | null> => ({ course_id: course })),
    signUpload: vi.fn(async (p: string) => ({ path: p, token: 'upload-token', signedUrl: 'https://storage.example.test/upload' })),
    uploadReservation: vi.fn(async (_user: string, _lesson: string, _id: string): Promise<{course_id: string; bucket: string; path: string} | null> => ({ course_id: course, bucket: 'lesson-pdfs', path })),
    inspectUpload: vi.fn(async (_path: string): Promise<{size: number; identity: string} | null> => ({ size: 10, identity: 'object:etag' })),
    finalizeUpload: vi.fn(async (_user: string, _lesson: string, _id: string, _size: number, _identity: string) => true),
  };
  return { io, handler: makeHandler(io) };
}
function request(body: unknown, token = 'jwt', origin = 'http://localhost:4200') {
  return new Request('http://localhost/function', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, origin },
    body: JSON.stringify(body),
  });
}
const list = { operation: 'list', lessonId: lesson };
const download = { ...list, operation: 'download', resourceId: resource };
const prepare = { operation: 'prepare-upload', lessonId: lesson, title: 'Partitura', fileName: 'partitura.pdf', fileSize: 1024, mimeType: 'application/pdf' };
const finalize = { operation: 'finalize-upload', lessonId: lesson, resourceId: resource };

describe('lesson resources', () => {
  it('finaliza tras inspección y admite reintento idempotente', async () => {
    const { handler, io } = setup();
    for (let i = 0; i < 2; i++) {
      const response = await handler(request(finalize));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ resourceId: resource, finalized: true });
    }
    expect(io.finalizeUpload).toHaveBeenCalledWith('verified-user', lesson, resource, 10, 'object:etag');
  });
  it('no inspecciona reservas ajenas ni rutas incorrectas', async () => {
    const { handler, io } = setup();
    io.uploadReservation.mockResolvedValueOnce(null).mockResolvedValueOnce({ course_id: course, bucket: 'lesson-pdfs', path: 'otra' });
    expect((await handler(request(finalize, 'jwt-user_metadata-admin'))).status).toBe(403);
    expect((await handler(request(finalize))).status).toBe(403);
    expect(io.inspectUpload).not.toHaveBeenCalled();
    expect(io.finalizeUpload).not.toHaveBeenCalled();
  });
  it('no finaliza objeto ausente ni expone errores de Storage', async () => {
    const { handler, io } = setup();
    io.inspectUpload.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('private token'));
    expect((await handler(request(finalize))).status).toBe(422);
    const failed = await handler(request(finalize));
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('private');
    expect(io.finalizeUpload).not.toHaveBeenCalled();
    expect((await handler(request({ ...finalize, path }))).status).toBe(400);
  });
  it('deniega cuando se revoca el rol antes de finalizar', async () => {
    const { handler, io } = setup();
    io.finalizeUpload.mockResolvedValue(false);
    const response = await handler(request(finalize));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Acceso denegado' });
  });
  it('reserva como administrador y firma exclusivamente la ruta canónica', async () => {
    const { handler, io } = setup();
    const response = await handler(request(prepare));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.path).toBe(`${course}/${lesson}/${result.resourceId}/file.pdf`);
    expect(result.token).toBe('upload-token');
    expect(io.reserve).toHaveBeenCalledWith('verified-user', lesson, result.resourceId, 'Partitura', 'partitura.pdf', 1024, 'application/pdf');
    expect(io.signUpload).toHaveBeenCalledWith(result.path);
  });
  it('deniega alumno y lección inexistente sin firmar, incluso con metadata falsificada', async () => {
    const { handler, io } = setup();
    io.reserve.mockResolvedValue(null);
    expect((await handler(request(prepare, 'jwt-user_metadata-admin'))).status).toBe(403);
    expect(io.reserve).toHaveBeenCalledWith('verified-user', lesson, expect.any(String), 'Partitura', 'partitura.pdf', 1024, 'application/pdf');
    expect(io.signUpload).not.toHaveBeenCalled();
  });
  it('rechaza datos inválidos antes de reservar', async () => {
    const { handler, io } = setup();
    for (const change of [
      { title: ' ' }, { title: 'a'.repeat(161) }, { title: 'a\nb' },
      { fileName: '../file.pdf' }, { fileName: 'file\\x.pdf' }, { fileName: 'file\n.pdf' },
      { fileName: 'file.txt' }, { fileSize: 0 }, { fileSize: 10485761 },
      { fileSize: 1.5 }, { mimeType: 'text/plain' }, { path: 'otro' },
    ]) expect((await handler(request({ ...prepare, ...change }))).status).toBe(400);
    expect(io.reserve).not.toHaveBeenCalled();
  });
  it('fallo de firma deja reserva pendiente y no expone error ni URL', async () => {
    const { handler, io } = setup();
    io.signUpload.mockRejectedValue(new Error('secret private details https://example.test'));
    const response = await handler(request(prepare));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/secret|https/);
    expect(io.reserve).toHaveBeenCalledOnce();
  });
  it('exige JWT verificado antes de consultar', async () => {
    const { handler, io } = setup(false);
    expect((await handler(request(list, 'jwt-forged-user_metadata-admin'))).status).toBe(401);
    expect(io.getUser).toHaveBeenCalledWith('jwt-forged-user_metadata-admin');
    expect(io.resources).not.toHaveBeenCalled();
    expect((await handler(new Request('http://localhost', { method: 'POST' }))).status).toBe(401);
  });
  it('deniega sin derecho sin obtener ni firmar recursos', async () => {
    const { handler, io } = setup(true, false);
    expect((await handler(request(download))).status).toBe(403);
    expect(io.sign).not.toHaveBeenCalled();
  });
  it('lista DTO sin rutas y firma solo el recurso solicitado', async () => {
    const { handler, io } = setup();
    const response = await handler(request(list));
    expect(await response.json()).toEqual({ items: [{ id: resource, title: row.title, kind: 'pdf' }] });
    expect(io.resources).toHaveBeenCalledWith('verified-user', lesson);
    const signed = await handler(request(download));
    expect(await signed.json()).toEqual({ downloadUrl: 'https://storage.example.test/signed' });
    expect(io.sign).toHaveBeenCalledWith(path, 60, 'PDF ficticio.pdf');
  });
  it('deriva el nombre seguro exclusivamente del título recuperado', async () => {
    const { handler, io } = setup();
    for (const [title, filename] of [
      ['Lección de Cádiz', 'Lección de Cádiz.pdf'],
      ['Acordes.PDF', 'Acordes.pdf'],
      ['  uno/\r\n dos\\:*?"<>|  ', 'uno    dos.pdf'],
      [' /\\:*?"<>| ', 'material.pdf'],
      ['.pdf', 'material.pdf'],
      ['CON', '_CON.pdf'],
      ['á'.repeat(130), `${'á'.repeat(116)}.pdf`],
    ]) {
      io.resources.mockResolvedValueOnce({ course_id: course, items: [{ ...row, title }] });
      expect((await handler(request(download))).status).toBe(200);
      expect(io.sign).toHaveBeenLastCalledWith(path, 60, filename);
    }
    expect((await handler(request({ ...download, filename: 'ajeno.pdf' }))).status).toBe(400);
  });
  it('deniega recurso ajeno y rutas o bucket incorrectos', async () => {
    const { handler, io } = setup();
    expect((await handler(request({ ...download, resourceId: '40000000-0000-0000-0000-000000000002' }))).status).toBe(403);
    io.resources.mockResolvedValue({ course_id: course, items: [{ ...row, path: `10000000-0000-0000-0000-000000000002/${lesson}/${resource}/file.pdf` }] });
    expect((await handler(request(download))).status).toBe(403);
    io.resources.mockResolvedValue({ course_id: course, items: [{ ...row, bucket: 'otro' }] });
    expect((await handler(request(download))).status).toBe(403);
    expect(io.sign).not.toHaveBeenCalled();
  });
  it('rechaza errores de entrada y CORS, maneja preflight y falla cerrado', async () => {
    const { handler, io } = setup();
    const deniedOrigin = await handler(request(list, 'jwt', 'https://evil.example'));
    expect(deniedOrigin.status).toBe(403);
    expect(deniedOrigin.headers.has('access-control-allow-origin')).toBe(false);
    const deniedPreflight = await handler(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(deniedPreflight.status).toBe(403);
    expect(deniedPreflight.headers.has('access-control-allow-origin')).toBe(false);
    expect((await handler(new Request('http://localhost', { method: 'GET' }))).status).toBe(405);
    const preflight = await handler(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'http://localhost:4200' } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:4200');
    expect((await handler(request({ ...list, lessonId: 'invalid' }))).status).toBe(400);
    expect((await handler(request({ ...list, resourceId: resource }))).status).toBe(400);
    expect((await handler(request({ ...list, courseId: course }))).status).toBe(400);
    expect((await handler(request({ ...list, lessonId: 'ABCDEF00-0000-0000-0000-000000000001' }))).status).toBe(400);
    expect((await handler(request({ ...download, resourceId: 'ABCDEF00-0000-0000-0000-000000000001' }))).status).toBe(400);
    io.resources.mockRejectedValue(new Error('private details'));
    const failed = await handler(request(list));
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('private details');
  });
  it('oculta errores de Auth y no consulta datos', async () => {
    const { handler, io } = setup();
    io.getUser.mockRejectedValue(new Error('secret private details'));
    const response = await handler(request(list));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret');
    expect(io.resources).not.toHaveBeenCalled();
  });
});

it('descarta cambios de objeto entre inspecciones y errores de Storage sin publicar', async () => {
  const valid = { id: 'object', name: path, bucketId: 'lesson-pdfs', size: 6, contentType: 'application/pdf', etag: 'etag' };
  const info = vi.fn();
  const get = vi.fn(async () => ({ data: new Blob(['%PDF-x']), error: null }));
  const adapter = createDependencies({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({
      info, download: get,
      createSignedUrl: async () => ({ data: null, error: null }),
      createSignedUploadUrl: async () => ({ data: null, error: null }),
    }) },
  });
  const { io } = setup();
  io.inspectUpload.mockImplementation(adapter.inspectUpload);
  const handler = makeHandler(io);
  for (const change of [{ id: 'other' }, { etag: 'other' }, { size: 7 }, { contentType: 'text/plain' }]) {
    info.mockResolvedValueOnce({ data: valid, error: null }).mockResolvedValueOnce({ data: { ...valid, ...change }, error: null });
    expect((await handler(request(finalize))).status).toBe(422);
    expect(io.finalizeUpload).not.toHaveBeenCalled();
  }
  info.mockResolvedValueOnce({ data: null, error: { status: 404, code: 'NoSuchKey' } });
  expect(await adapter.inspectUpload(path)).toBeNull();
  info.mockResolvedValueOnce({ data: valid, error: null });
  get.mockRejectedValueOnce(new Error('token privado'));
  const response = await handler(request(finalize));
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('token');
  expect(io.finalizeUpload).not.toHaveBeenCalled();
});

it('adaptador delega JWT en Auth y firma adjunto con SDK simulado', async () => {
  const getUser = vi.fn(async (_jwt: string) => ({ data: { user: { id: 'verified' } }, error: null }));
  const sign = vi.fn(async (_path: string, _ttl: number, _options: {download: string}) =>
    ({ data: { signedUrl: 'signed' }, error: null }));
  const upload = vi.fn(async (p: string) => ({ data: { signedUrl: 'signed-upload', token: 'token', path: p }, error: null }));
  const info = vi.fn(async (_p: string): Promise<{data: {id: string; name: string; bucketId: string; size: number; contentType: string; etag: string} | null; error: null}> =>
    ({ data: { id: 'object', name: path, bucketId: 'lesson-pdfs', size: 6, contentType: 'application/pdf', etag: 'etag' }, error: null }));
  const get = vi.fn(async (_p: string) => ({ data: new Blob(['%PDF-x']), error: null }));
  const from = vi.fn((_bucket: string) => ({ createSignedUrl: sign, createSignedUploadUrl: upload, info, download: get }));
  const rpc = vi.fn(async (_name: string, _args: {p_user_id: string; p_lesson_id: string}) =>
    ({ data: null, error: null }));
  const adapter = createDependencies({ auth: { getUser }, rpc, storage: { from } });
  expect(await adapter.getUser('token')).toBe('verified');
  expect(getUser).toHaveBeenCalledWith('token');
  await adapter.resources('verified', lesson);
  expect(rpc).toHaveBeenCalledWith('server_lesson_pdf_resources', { p_user_id: 'verified', p_lesson_id: lesson });
  expect(await adapter.sign(path, 60, 'Lección de Cádiz.pdf')).toBe('signed');
  expect(from).toHaveBeenCalledWith('lesson-pdfs');
  expect(sign).toHaveBeenCalledWith(path, 60, { download: 'Lección de Cádiz.pdf' });
  await adapter.reserve('verified', lesson, resource, 'PDF', 'file.pdf', 1, 'application/pdf');
  expect(rpc).toHaveBeenCalledWith('server_prepare_lesson_pdf', expect.objectContaining({ p_user_id: 'verified', p_resource_id: resource }));
  expect(await adapter.signUpload(path)).toEqual({ signedUrl: 'signed-upload', token: 'token', path });
  expect(upload).toHaveBeenCalledWith(path);
  expect(await adapter.inspectUpload(path)).toEqual({ size: 6, identity: 'object:etag' });
  for (const change of [{ size: 0 }, { size: 10485761 }, { contentType: 'text/plain' }, { name: 'wrong' }, { bucketId: 'wrong' }]) {
    info.mockResolvedValueOnce({ data: { id: 'object', name: path, bucketId: 'lesson-pdfs', size: 6, contentType: 'application/pdf', etag: 'etag', ...change }, error: null });
    expect(await adapter.inspectUpload(path)).toBeNull();
  }
  get.mockResolvedValueOnce({ data: new Blob(['wrong!']), error: null });
  expect(await adapter.inspectUpload(path)).toBeNull();
});
