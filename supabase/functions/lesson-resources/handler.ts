export const BUCKET = 'lesson-pdfs';
export const TTL_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Item = { id: string; title: string; kind: string; bucket: string; path: string };
export interface Dependencies {
  getUser(token: string): Promise<string | null>;
  resources(user: string, lesson: string): Promise<{ course_id: string; items: Item[] } | null>;
  sign(path: string, ttl: number): Promise<string>;
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
          (body.operation !== 'list' && body.operation !== 'download') ||
          typeof body.lessonId !== 'string' || !UUID.test(body.lessonId) ||
          (body.operation === 'download' &&
           (typeof body.resourceId !== 'string' || !UUID.test(body.resourceId))) ||
          Object.keys(body).some(k => !['operation', 'lessonId', 'resourceId'].includes(k)) ||
          (body.operation === 'list' && 'resourceId' in body)) {
        return reply(400, { error: 'Solicitud inválida' });
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
      const downloadUrl = await io.sign(item.path, TTL_SECONDS);
      return reply(200, { downloadUrl });
    } catch {
      return reply(500, { error: 'No se pudo completar la operación' });
    }
  };
}
