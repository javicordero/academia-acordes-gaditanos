import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import * as tus from 'tus-js-client';

import { TUS_UPLOAD_FACTORY } from './tus-upload.factory';
import { BUNNY_TUS_ENDPOINT, InvalidResumeUrlError } from './video-upload-contract';

describe('TUS factory · frontera de reanudación', () => {
  it('no delega al SDK una URL de reanudación ajena al endpoint oficial', async () => {
    const factory = TestBed.inject(TUS_UPLOAD_FACTORY);
    const delegate = vi.spyOn(tus.Upload.prototype, 'resumeFromPreviousUpload')
      .mockImplementation(() => {});
    const file = new File(['x'], 'leccion.mp4', { type: 'video/mp4' });
    const upload = await factory.create(file, {
      endpoint: BUNNY_TUS_ENDPOINT,
      headers: { AuthorizationSignature: 'firma-ficticia' },
      metadata: { title: 'leccion.mp4', filetype: 'video/mp4' },
      fingerprint: async () => 'huella',
      onProgress: () => {},
      onSuccess: () => {},
      onError: () => {},
      onShouldRetry: () => false,
      retryDelays: [],
      removeFingerprintOnSuccess: true,
    });

    expect(() => upload.resumeFromPreviousUpload({ uploadUrl: 'https://evil.example/tusupload/abc' }))
      .toThrow(InvalidResumeUrlError);
    expect(() => upload.resumeFromPreviousUpload({ uploadUrl: 'https://user:pw@video.bunnycdn.com/tusupload/abc' }))
      .toThrow(InvalidResumeUrlError);
    expect(delegate).not.toHaveBeenCalled();

    upload.resumeFromPreviousUpload({ uploadUrl: '/tusupload/abc' });
    expect(delegate).toHaveBeenCalledTimes(1);
    expect(delegate).toHaveBeenCalledWith({ uploadUrl: 'https://video.bunnycdn.com/tusupload/abc' });
    delegate.mockRestore();
  });
});
