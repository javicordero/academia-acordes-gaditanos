export const BUCKET = 'lesson-pdfs';
export const TTL_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Item = { id: string; title: string; kind: string; bucket: string; path: string };
export interface Dependencies {
  getUser(token: string): Promise<string | null>;
  resources(user: string, lesson: string): Promise<{ course_id: string; items: Item[] } | null>;
  sign(path: string, ttl: number, filename: string): Promise<string>;
  reserve(user: string, lesson: string, id: string, title: string, fileName: string, fileSize: number, mimeType: string): Promise<{ course_id: string } | null>;
  signUpload(path: string): Promise<{ signedUrl: string; token: string; path: string }>;
  uploadReservation(user: string, lesson: string, id: string): Promise<{ course_id: string; bucket: string; path: string } | null>;
  inspectUpload(path: string): Promise<{ size: number; identity: string } | null>;
  finalizeUpload(user: string, lesson: string, id: string, size: number, identity: string): Promise<boolean>;
}

function downloadFilename(title: unknown): string {
  const clean = typeof title === 'string'
    ? title.replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, ' ').trim().replace(/\.pdf$/i, '').trim()
    : '';
  let base = [...clean].slice(0, 116).join('').replace(/[. ]+$/g, '').trim();
  if (!base || /^\.+$/.test(base)) base = 'material';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) {
    base = `_${[...base].slice(0, 115).join('')}`.replace(/[. ]+$/g, '');
  }
  return `${base}.pdf`;
}

export function makeHandler(io: Dependencies, origins = ['http://localhost:4200']) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (origin && !origins.includes(origin)) return new Response(null, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const reply = (status: number, value: unknown) =>
      Response.json(value, { status, headers });
    if (request.method !== 'POST') return reply(405, { error: 'Método no permitido' });
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!match) return reply(401, { error: 'Autenticación necesaria' });
    try {
      const user = await io.getUser(match[1]);
      if (!user) return reply(401, { error: 'Autenticación necesaria' });
      let body: Record<string, unknown>;
      try {
        const raw = await request.text();
        if (raw.length > 2048) return reply(400, { error: 'Solicitud inválida' });
        body = JSON.parse(raw);
      } catch { return reply(400, { error: 'Solicitud inválida' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          !['list', 'download', 'prepare-upload', 'finalize-upload'].includes(body.operation as string) ||
          typeof body.lessonId !== 'string' || !UUID.test(body.lessonId) ||
          ((body.operation === 'download' || body.operation === 'finalize-upload') &&
           (typeof body.resourceId !== 'string' || !UUID.test(body.resourceId))) ||
          Object.keys(body).some(k => !(body.operation === 'prepare-upload'
            ? ['operation', 'lessonId', 'title', 'fileName', 'fileSize', 'mimeType']
            : ['operation', 'lessonId', 'resourceId']).includes(k)) ||
          (body.operation === 'list' && 'resourceId' in body)) {
        return reply(400, { error: 'Solicitud inválida' });
      }
      if (body.operation === 'prepare-upload') {
        if (typeof body.title !== 'string' || body.title.trim().length < 1 ||
            [...body.title.trim()].length > 160 || /[\x00-\x1f\x7f]/.test(body.title) ||
            typeof body.fileName !== 'string' || body.fileName.length > 255 ||
            !/^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/i.test(body.fileName) ||
            typeof body.fileSize !== 'number' || !Number.isInteger(body.fileSize) ||
            body.fileSize < 1 || body.fileSize > 10 * 1024 * 1024 ||
            body.mimeType !== 'application/pdf') return reply(400, { error: 'Solicitud inválida' });
        const id = crypto.randomUUID();
        const reserved = await io.reserve(user, body.lessonId, id, body.title.trim(),
          body.fileName, body.fileSize, body.mimeType);
        if (!reserved) return reply(403, { error: 'Acceso denegado' });
        if (!UUID.test(reserved.course_id)) throw new Error('Respuesta inválida');
        const path = `${reserved.course_id}/${body.lessonId}/${id}/file.pdf`;
        const signed = await io.signUpload(path);
        if (signed.path !== path || !signed.signedUrl || !signed.token) throw new Error('Firma inválida');
        return reply(200, { resourceId: id, ...signed });
      }
      if (body.operation === 'finalize-upload') {
        const id = body.resourceId as string;
        const reservation = await io.uploadReservation(user, body.lessonId, id);
        if (!reservation) return reply(403, { error: 'Acceso denegado' });
        if (!UUID.test(reservation.course_id) || reservation.bucket !== BUCKET ||
            reservation.path !== `${reservation.course_id}/${body.lessonId}/${id}/file.pdf`) {
          return reply(403, { error: 'Acceso denegado' });
        }
        const object = await io.inspectUpload(reservation.path);
        if (!object) return reply(422, { error: 'Archivo no válido o ausente' });
        if (!await io.finalizeUpload(user, body.lessonId, id, object.size, object.identity)) {
          return reply(403, { error: 'Acceso denegado' });
        }
        return reply(200, { resourceId: id, finalized: true });
      }
      const result = await io.resources(user, body.lessonId);
      if (!result) return reply(403, { error: 'Acceso denegado' });
      // Defensa adicional: nunca firmar rutas que no coincidan con los UUID esperados.
      if (typeof result.course_id !== 'string' || !UUID.test(result.course_id) ||
          !Array.isArray(result.items)) throw new Error('Respuesta inválida');
      const items = result.items.filter(item => {
        if (!UUID.test(item.id) || item.kind !== 'pdf' || item.bucket !== BUCKET) return false;
        if (typeof item.path !== 'string') return false;
        const parts = item.path.split('/');
        return parts.length === 4 && parts[0] === result.course_id && parts[1] === body.lessonId &&
          parts[2] === item.id && parts[3] === 'file.pdf';
      });
      if (body.operation === 'list') return reply(200, {
        items: items.map(({ id, title, kind }) => ({ id, title, kind })),
      });
      const item = items.find(row => row.id === body.resourceId);
      if (!item) return reply(403, { error: 'Acceso denegado' });
      const downloadUrl = await io.sign(item.path, TTL_SECONDS, downloadFilename(item.title));
      return reply(200, { downloadUrl });
    } catch {
      return reply(500, { error: 'No se pudo completar la operación' });
    }
  };
}
