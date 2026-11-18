import type { Dependencies, LinkResult, StoredStatus, VideoVerification } from './handler.ts';

export interface AdapterConfig {
  libraryId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

// Contrato mínimo del SDK: Auth verifica el JWT; el rol admin se consulta en
// public.user_roles (nunca en user_metadata). La RPC vuelve a comprobarlo.
export function createDependencies(
  client: {
    auth: {
      getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
    };
    from(table: string): {
      select(columns: string): {
        eq(column: string, value: string): {
          eq(column: string, value: string): {
            limit(count: number): PromiseLike<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  },
  config: AdapterConfig,
): Dependencies {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async getUser(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async isAdmin(user) {
      const { data, error } = await client.from('user_roles')
        .select('user_id').eq('user_id', user).eq('role', 'admin').limit(1);
      if (error) throw error;
      return Array.isArray(data) && data.length > 0;
    },
    async verifyVideo(videoId): Promise<VideoVerification | null> {
      const url = `https://video.bunnycdn.com/library/${encodeURIComponent(config.libraryId)}/videos/${encodeURIComponent(videoId)}`;
      const response = await fetchImpl(url, { headers: { AccessKey: config.apiKey } });
      if (!response.ok) return null;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return null;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
      const row = payload as { status?: unknown; length?: unknown };
      if (typeof row.status !== 'number' || !Number.isFinite(row.status) ||
          typeof row.length !== 'number' || !Number.isFinite(row.length)) return null;
      return { status: row.status, length: row.length };
    },
    async link(user, lessonId, libraryId, videoId, durationSeconds, status: StoredStatus): Promise<LinkResult> {
      const { data, error } = await client.rpc('server_link_lesson_video', {
        p_user_id: user,
        p_lesson_id: lessonId,
        p_provider_library_id: libraryId,
        p_video_id: videoId,
        p_duration_seconds: durationSeconds,
        p_status: status,
      });
      if (error) {
        const code = (error as { code?: unknown }).code;
        const message = (error as { message?: unknown }).message;
        const text = typeof message === 'string' ? message : '';
        if (code === '23505' || (code === 'P0001' && text.includes('conflict'))) {
          return { kind: 'conflict' };
        }
        if (code === '42501' || text.includes('forbidden')) return { kind: 'denied' };
        throw error;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'denied' };
      const row = data as { linkage?: unknown; status?: unknown };
      if ((row.linkage !== 'linked' && row.linkage !== 'linked_yet') ||
          (row.status !== 'ready' && row.status !== 'processing')) {
        throw new Error('Respuesta inválida');
      }
      return { kind: 'ok', value: { linkage: row.linkage, status: row.status } };
    },
  };
}
