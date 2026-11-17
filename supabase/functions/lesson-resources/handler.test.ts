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
    sign: vi.fn(async (_path: string, _ttl: number) => 'https://storage.example.test/signed'),
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

describe('lesson resources', () => {
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
    expect(io.sign).toHaveBeenCalledWith(path, 60);
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

it('adaptador delega JWT en Auth y firma adjunto con SDK simulado', async () => {
  const getUser = vi.fn(async (_jwt: string) => ({ data: { user: { id: 'verified' } }, error: null }));
  const sign = vi.fn(async (_path: string, _ttl: number, _options: {download: boolean}) =>
    ({ data: { signedUrl: 'signed' }, error: null }));
  const from = vi.fn((_bucket: string) => ({ createSignedUrl: sign }));
  const rpc = vi.fn(async (_name: string, _args: {p_user_id: string; p_lesson_id: string}) =>
    ({ data: null, error: null }));
  const adapter = createDependencies({ auth: { getUser }, rpc, storage: { from } });
  expect(await adapter.getUser('token')).toBe('verified');
  expect(getUser).toHaveBeenCalledWith('token');
  await adapter.resources('verified', lesson);
  expect(rpc).toHaveBeenCalledWith('server_lesson_pdf_resources', { p_user_id: 'verified', p_lesson_id: lesson });
  expect(await adapter.sign(path, 60)).toBe('signed');
  expect(from).toHaveBeenCalledWith('lesson-pdfs');
  expect(sign).toHaveBeenCalledWith(path, 60, { download: true });
});
