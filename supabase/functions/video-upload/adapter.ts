import type {
  AttachResult, ConflictCode, CreateResult, Dependencies, Job, ProviderVideo,
  RefreshResult, ReserveResult, StatusInfo, StatusResult, SyncResult,
} from './handler.ts';

const API_ORIGIN = 'https://video.bunnycdn.com';
const API_HOST = 'video.bunnycdn.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATES = new Set(['reserved', 'pending', 'uploading', 'processing', 'ready', 'failed', 'blocked']);
const CONFLICTS = new Set<ConflictCode>([
  'active_job', 'ready_exists', 'request_mismatch', 'invalid_lesson', 'invalid_request',
  'conflict', 'guid_in_use', 'not_active', 'not_found',
]);

export interface AdapterConfig {
  libraryId: string;
  /** Secreto de servidor: nunca se devuelve, se registra ni se envía al cliente. */
  apiKey: string;
  fetchImpl?: typeof fetch;
}

type RpcClient = {
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
};

type RpcFailure = { kind: 'denied' } | { kind: 'conflict'; code: ConflictCode };

function rpcFailure(error: unknown): RpcFailure | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  const raw = (error as { message?: unknown }).message;
  const message = typeof raw === 'string' ? raw : '';
  if (code === '42501' || message === 'forbidden') return { kind: 'denied' };
  if (code === 'P0001') {
    const candidate = message as ConflictCode;
    return { kind: 'conflict', code: CONFLICTS.has(candidate) ? candidate : 'conflict' };
  }
  if (code === '22023' || message === 'invalid_request') return { kind: 'conflict', code: 'invalid_request' };
  if (code === 'P0002' || message === 'not_found') return { kind: 'conflict', code: 'not_found' };
  return null;
}

function parseJob(value: unknown): Job {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('job inválido');
  const row = value as Record<string, unknown>;
  for (const key of ['uploadId', 'requestId', 'lessonId', 'fileName', 'mimeType']) {
    if (typeof row[key] !== 'string') throw new Error('job inválido');
  }
  for (const key of ['uploadId', 'requestId', 'lessonId']) {
    if (!UUID.test(row[key] as string)) throw new Error('job inválido');
  }
  const video = row['providerVideoId'];
  const library = row['providerLibraryId'];
  const expires = row['expiresAt'];
  const duration = row['durationSeconds'];
  const size = row['fileSize'];
  const state = row['state'];
  if (typeof state !== 'string' || !STATES.has(state)) throw new Error('job inválido');
  if (video !== null && (typeof video !== 'string' || !UUID.test(video))) throw new Error('job inválido');
  if (library !== null && (typeof library !== 'string' || !/^[0-9]{1,12}$/.test(library))) {
    throw new Error('job inválido');
  }
  if (expires !== null && (!Number.isInteger(expires) || (expires as number) <= 0)) throw new Error('job inválido');
  if (duration !== null && (!Number.isInteger(duration) || (duration as number) < 0)) throw new Error('job inválido');
  if (!Number.isInteger(size) || (size as number) <= 0) throw new Error('job inválido');
  if (typeof row['reviewRequired'] !== 'boolean' || typeof row['createAttempted'] !== 'boolean') {
    throw new Error('job inválido');
  }
  return {
    uploadId: row['uploadId'] as string,
    requestId: row['requestId'] as string,
    lessonId: row['lessonId'] as string,
    fileName: row['fileName'] as string,
    fileSize: size as number,
    mimeType: row['mimeType'] as string,
    state: state as Job['state'],
    providerVideoId: video as string | null,
    providerLibraryId: library as string | null,
    expiresAt: expires as number | null,
    durationSeconds: duration as number | null,
    reviewRequired: row['reviewRequired'] as boolean,
    createAttempted: row['createAttempted'] as boolean,
  };
}

function parseStatusInfo(value: unknown): StatusInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('status inválido');
  const row = value as Record<string, unknown>;
  if (typeof row['contentType'] !== 'string' || typeof row['hasVideo'] !== 'boolean') {
    throw new Error('status inválido');
  }
  const duration = row['durationSeconds'];
  if (duration !== null && (!Number.isInteger(duration) || (duration as number) < 0)) {
    throw new Error('status inválido');
  }
  return {
    contentType: row['contentType'] as string,
    hasVideo: row['hasVideo'] as boolean,
    durationSeconds: duration as number | null,
    job: row['job'] === null || row['job'] === undefined ? null : parseJob(row['job']),
  };
}

function assertBunny(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== API_HOST) {
    throw new Error('URL de proveedor no permitida');
  }
}

export function createDependencies(client: RpcClient, config: AdapterConfig): Dependencies {
  const fetchImpl = config.fetchImpl ?? fetch;

  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const failure = rpcFailure(error);
      if (failure) throw new RpcError(failure);
      throw error;
    }
    return data;
  };

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
    async status(user, lessonId) {
      try {
        const info = parseStatusInfo(await call('video_upload_status', {
          p_user_id: user, p_lesson_id: lessonId,
        }));
        return { kind: 'ok', info } as StatusResult;
      } catch (error) {
        return asResult<StatusResult>(error);
      }
    },
    async reserve(user, lessonId, requestId, fileName, fileSize, mimeType, libraryId) {
      try {
        const data = await call('video_upload_reserve', {
          p_user_id: user,
          p_lesson_id: lessonId,
          p_request_id: requestId,
          p_file_name: fileName,
          p_file_size: fileSize,
          p_mime_type: mimeType,
          p_library_id: libraryId,
        });
        if (!data || typeof data !== 'object') throw new Error('reserva inválida');
        const row = data as Record<string, unknown>;
        return {
          kind: 'ok',
          created: row['created'] === true,
          job: parseJob(row['job']),
        } as ReserveResult;
      } catch (error) {
        return asResult<ReserveResult>(error);
      }
    },
    async attach(user, uploadId, lessonId, requestId, libraryId, videoId, expiresAt) {
      try {
        const data = await call('video_upload_attach', {
          p_user_id: user,
          p_upload_id: uploadId,
          p_lesson_id: lessonId,
          p_request_id: requestId,
          p_library_id: libraryId,
          p_video_id: videoId,
          p_expires_at: expiresAt,
        });
        if (!data || typeof data !== 'object') throw new Error('attach inválido');
        return { kind: 'ok', job: parseJob((data as Record<string, unknown>)['job']) } as AttachResult;
      } catch (error) {
        return asResult<AttachResult>(error);
      }
    },
    async refresh(user, uploadId, lessonId, expiresAt) {
      try {
        const job = parseJob(await call('video_upload_refresh', {
          p_user_id: user,
          p_upload_id: uploadId,
          p_lesson_id: lessonId,
          p_expires_at: expiresAt,
        }));
        return { kind: 'ok', job } as RefreshResult;
      } catch (error) {
        return asResult<RefreshResult>(error);
      }
    },
    async sync(user, uploadId, videoId, providerStatus, lengthSeconds) {
      try {
        const data = await call('video_upload_sync', {
          p_user_id: user,
          p_upload_id: uploadId,
          p_video_id: videoId,
          p_provider_status: providerStatus,
          p_duration_seconds: lengthSeconds,
        });
        if (!data || typeof data !== 'object') throw new Error('sync inválido');
        const row = data as Record<string, unknown>;
        const state = row['state'];
        const duration = row['durationSeconds'];
        if (typeof state !== 'string' || !STATES.has(state)) throw new Error('sync inválido');
        if (duration !== null && (!Number.isInteger(duration) || (duration as number) < 0)) {
          throw new Error('sync inválido');
        }
        return {
          kind: 'ok',
          state: state === 'reserved' ? 'pending' : state,
          durationSeconds: duration as number | null,
        } as SyncResult;
      } catch (error) {
        return asResult<SyncResult>(error);
      }
    },
    async markReview(user, uploadId, reason) {
      const data = await call('video_upload_mark_review', {
        p_user_id: user, p_upload_id: uploadId, p_reason: reason,
      });
      return data === true;
    },
    async createVideo(title): Promise<CreateResult> {
      const url = `${API_ORIGIN}/library/${encodeURIComponent(config.libraryId)}/videos`;
      assertBunny(url);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            AccessKey: config.apiKey,
          },
          body: JSON.stringify({ title }),
        });
      } catch {
        // No se sabe si el objeto se creó: ambiguo, sin reintento automático.
        return { kind: 'ambiguous' };
      }
      if (!response.ok) return { kind: 'ambiguous' };
      try {
        const payload = await response.json() as { guid?: unknown };
        if (typeof payload?.guid === 'string' && UUID.test(payload.guid)) {
          return { kind: 'ok', videoId: payload.guid };
        }
      } catch { /* ambiguo */ }
      return { kind: 'ambiguous' };
    },
    async videoStatus(videoId): Promise<ProviderVideo | null> {
      const url = `${API_ORIGIN}/library/${encodeURIComponent(config.libraryId)}/videos/${encodeURIComponent(videoId)}`;
      assertBunny(url);
      const response = await fetchImpl(url, { headers: { Accept: 'application/json', AccessKey: config.apiKey } });
      if (!response.ok) return null;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return null;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
      const row = payload as { status?: unknown; length?: unknown };
      if (typeof row.status !== 'number' || !Number.isInteger(row.status) || row.status < 0 || row.status > 8) {
        return null;
      }
      if (typeof row.length !== 'number' || !Number.isFinite(row.length)) return null;
      return { status: row.status, length: row.length };
    },
    async signUpload(libraryId, videoId, expiresAt) {
      // Bunny: SHA256(libraryId + API key + expiry + videoId). Sin playback key.
      const seed = libraryId + config.apiKey + String(expiresAt) + videoId;
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    },
  };
}

class RpcError extends Error {
  constructor(readonly failure: RpcFailure) {
    super('rpc failure');
  }
}

function asResult<T extends { kind: string }>(error: unknown): T {
  if (error instanceof RpcError) {
    if (error.failure.kind === 'denied') return { kind: 'denied' } as T;
    return { kind: 'conflict', code: error.failure.code } as T;
  }
  throw error;
}
