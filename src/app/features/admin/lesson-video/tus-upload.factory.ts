import { InjectionToken } from '@angular/core';

import { InvalidResumeUrlError, resolveBunnyTusResumeUrl } from './video-upload-contract';

/**
 * Fábrica inyectable de subidas TUS. Aísla la biblioteca `tus-js-client` detrás
 * de una interfaz mínima: las pruebas sustituyen el token por un mock y no
 * ejecutan ninguna petición XHR. La librería se importa de forma diferida solo
 * cuando el administrador pulsa «Subir», para no engordar el bundle inicial.
 */

export type TusFingerprint = (file: File) => Promise<string>;

export interface TusTransferOptions {
  readonly endpoint: string;
  readonly headers: Record<string, string>;
  readonly metadata: Record<string, string>;
  readonly fingerprint: TusFingerprint;
  readonly onProgress: (bytesSent: number, bytesTotal: number) => void;
  readonly onSuccess: () => void;
  readonly onError: (error: unknown) => void;
  readonly onShouldRetry: (status: number | null, attempt: number) => boolean;
  readonly retryDelays: number[];
  readonly removeFingerprintOnSuccess: boolean;
}

export interface TusPreviousUpload {
  readonly uploadUrl: string | null;
}

export interface TusUploadLike {
  readonly url: string | null;
  start(): void;
  /** `false` detiene solo el cliente; nunca termina ni borra el vídeo remoto. */
  abort(shouldTerminate?: boolean): Promise<void>;
  findPreviousUploads(): Promise<TusPreviousUpload[]>;
  resumeFromPreviousUpload(previous: TusPreviousUpload): void;
}

export interface TusUploadFactory {
  create(file: File, options: TusTransferOptions): Promise<TusUploadLike>;
}

export const TUS_UPLOAD_FACTORY = new InjectionToken<TusUploadFactory>(
  'TUS_UPLOAD_FACTORY',
  { providedIn: 'root', factory: () => new LazyTusUploadFactory() },
);

class LazyTusUploadFactory implements TusUploadFactory {
  private module: Promise<typeof import('tus-js-client')> | null = null;

  private load(): Promise<typeof import('tus-js-client')> {
    this.module ??= import('tus-js-client');
    return this.module;
  }

  async create(file: File, options: TusTransferOptions): Promise<TusUploadLike> {
    const tus = await this.load();
    const upload = new tus.Upload(file, {
      endpoint: options.endpoint,
      headers: options.headers,
      metadata: options.metadata,
      fingerprint: (input) => options.fingerprint(input as File),
      onProgress: options.onProgress,
      onSuccess: () => options.onSuccess(),
      onError: (error) => options.onError(error),
      onShouldRetry: (error, attempt) => {
        const status = error?.originalResponse ? error.originalResponse.getStatus() : null;
        return options.onShouldRetry(status, attempt);
      },
      retryDelays: options.retryDelays,
      removeFingerprintOnSuccess: options.removeFingerprintOnSuccess,
    });

    return {
      get url() { return upload.url; },
      start: () => upload.start(),
      abort: (shouldTerminate) => upload.abort(shouldTerminate),
      findPreviousUploads: async () => upload.findPreviousUploads(),
      resumeFromPreviousUpload: (previous) => {
        // Defensa en la frontera: ningún llamador puede hacer que tus envíe las
        // cabeceras firmadas a un host que no sea el endpoint oficial.
        const safe = resolveBunnyTusResumeUrl(previous?.uploadUrl);
        if (safe === null) throw new InvalidResumeUrlError();
        upload.resumeFromPreviousUpload(
          { uploadUrl: safe } as Parameters<typeof upload.resumeFromPreviousUpload>[0],
        );
      },
    };
  }
}
