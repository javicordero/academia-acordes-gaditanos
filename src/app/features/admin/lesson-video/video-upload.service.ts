import { Injectable, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import {
  InvalidUploadResponseError,
  UploadHttpError,
  VIDEO_UPLOAD_FUNCTION,
  VIDEO_UPLOAD_NOW,
  UploadGrant,
  UploadStatus,
  uploadHttpMessage,
  uploadStatusOf,
  validateGrant,
  validateStatus,
} from './video-upload-contract';

/**
 * Adaptador de la Edge Function `video-upload`. Usa el SDK de Supabase con la
 * sesión JWT real (`functions.invoke`); aquí no se pasa ningún token, clave ni
 * secreto. `status` solo lee; `prepare` y `refresh` solicitan una concesión
 * TUS temporal con privilegios de administrador.
 */
@Injectable({ providedIn: 'root' })
export class VideoUploadService {
  private readonly client = inject(SUPABASE_CLIENT, { optional: true });
  private readonly now = inject(VIDEO_UPLOAD_NOW);

  async status(lessonId: string, uploadId?: string): Promise<UploadStatus> {
    const body = uploadId
      ? { action: 'status', lessonId, uploadId }
      : { action: 'status', lessonId };
    const data = await this.invoke(body);
    const parsed = validateStatus(data);
    if (!parsed) throw new InvalidUploadResponseError();
    return parsed;
  }

  async prepare(
    lessonId: string,
    requestId: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
  ): Promise<UploadGrant> {
    const data = await this.invoke({
      action: 'prepare', lessonId, requestId, fileName, fileSize, mimeType,
    });
    return this.parseGrant(data);
  }

  async refresh(lessonId: string, uploadId: string): Promise<UploadGrant> {
    const data = await this.invoke({ action: 'refresh', lessonId, uploadId });
    return this.parseGrant(data);
  }

  private parseGrant(data: unknown): UploadGrant {
    const parsed = validateGrant(data, this.now());
    if (!parsed) throw new InvalidUploadResponseError();
    return parsed;
  }

  private async invoke(body: Record<string, unknown>): Promise<unknown> {
    if (!this.client) {
      throw new UploadHttpError(
        null,
        'La conexión con el servidor no está configurada; no se ha subido nada.',
      );
    }

    try {
      const { data, error } = await this.client.functions.invoke(VIDEO_UPLOAD_FUNCTION, { body });
      if (error) {
        const status = uploadStatusOf(error);
        throw new UploadHttpError(status, uploadHttpMessage(status));
      }
      return data;
    } catch (error) {
      if (error instanceof UploadHttpError) throw error;
      // Nunca propagar el mensaje del SDK: puede contener URLs, firmas o claves.
      throw new UploadHttpError(null, uploadHttpMessage(null));
    }
  }
}
