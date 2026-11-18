import type { Dependencies, VideoRow } from './handler.ts';

// Contrato minimo del SDK; el JWT se verifica contra Auth, no se decodifica a mano.
export function createDependencies(client: {
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(name: string, args: any): PromiseLike<{ data: any; error: unknown }>;
}): Dependencies {
  return {
    async getUser(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async video(user, lesson): Promise<VideoRow | null> {
      const { data, error } = await client.rpc('server_lesson_video', { p_user_id: user, p_lesson_id: lesson });
      if (error) throw error;
      return (data ?? null) as VideoRow | null;
    },
    async sign(seed) {
      const { createHash } = await import('node:crypto');
      return createHash('sha256').update(seed).digest('hex');
    },
  };
}
