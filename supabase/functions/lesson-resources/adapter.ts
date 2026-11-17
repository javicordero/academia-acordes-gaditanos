import { BUCKET, type Dependencies } from './handler.ts';

// Contrato mínimo del SDK; la autenticación consulta Auth, no decodifica claims.
export function createDependencies(client: {
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(name: string, args: any): PromiseLike<{ data: any; error: unknown }>;
  storage: { from(bucket: string): {
    createSignedUrl(path: string, ttl: number, options: { download: boolean }): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>;
    createSignedUploadUrl(path: string): PromiseLike<{ data: { signedUrl: string; token: string; path: string } | null; error: unknown }>;
    info(path: string): PromiseLike<{ data: { id: string; name: string; bucketId: string; size?: number; contentType?: string; etag?: string; version?: string } | null; error: { status?: number; code?: string } | null }>;
    download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
  } };
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
    async reserve(user, lesson, id, title, fileName, fileSize, mimeType) {
      const { data, error } = await client.rpc('server_prepare_lesson_pdf', {
        p_user_id: user, p_lesson_id: lesson, p_resource_id: id, p_title: title,
        p_file_name: fileName, p_file_size: fileSize, p_mime_type: mimeType,
      });
      if (error) throw error;
      return data;
    },
    async signUpload(path) {
      const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error('Firma no disponible');
      return data;
    },
    async uploadReservation(user, lesson, id) {
      const { data, error } = await client.rpc('server_lesson_pdf_reservation', { p_user_id: user, p_lesson_id: lesson, p_resource_id: id });
      if (error) throw error;
      return data;
    },
    async inspectUpload(path) {
      const bucket = client.storage.from(BUCKET);
      const { data, error } = await bucket.info(path);
      if (error) {
        if (error.code === 'NoSuchKey' || (error.status === 404 && !error.code)) return null;
        throw error;
      }
      if (!data || data.name !== path || data.bucketId !== BUCKET ||
          !Number.isInteger(data.size) || !data.size || data.size < 1 || data.size > 10485760 ||
          data.contentType !== 'application/pdf' || !data.id || !data.etag) return null;
      const { data: blob, error: downloadError } = await bucket.download(path);
      if (downloadError || !blob) throw downloadError ?? new Error('Descarga no disponible');
      if (blob.size !== data.size || await blob.slice(0, 5).text() !== '%PDF-') return null;
      const after = await bucket.info(path);
      if (after.error) throw after.error;
      if (!after.data || after.data.id !== data.id || after.data.etag !== data.etag ||
          after.data.size !== data.size || after.data.contentType !== data.contentType) return null;
      return { size: data.size, identity: `${data.id}:${data.etag}` };
    },
    async finalizeUpload(user, lesson, id, size, identity) {
      const { data, error } = await client.rpc('server_finalize_lesson_pdf', {
        p_user_id: user, p_lesson_id: lesson, p_resource_id: id, p_size: size, p_identity: identity,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
