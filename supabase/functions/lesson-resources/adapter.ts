import { BUCKET, type Dependencies } from './handler.ts';

// Contrato mínimo del SDK; la autenticación consulta Auth, no decodifica claims.
export function createDependencies(client: {
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(name: string, args: { p_user_id: string; p_lesson_id: string }): PromiseLike<{ data: any; error: unknown }>;
  storage: { from(bucket: string): { createSignedUrl(path: string, ttl: number, options: { download: boolean }): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }> } };
}): Dependencies {
  return {
    async getUser(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async resources(user, lesson) {
      const { data, error } = await client.rpc('server_lesson_pdf_resources', { p_user_id: user, p_lesson_id: lesson });
      if (error) throw error;
      return data;
    },
    async sign(path, ttl) {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, ttl, { download: true });
      if (error || !data?.signedUrl) throw error ?? new Error('Firma no disponible');
      return data.signedUrl;
    },
  };
}
