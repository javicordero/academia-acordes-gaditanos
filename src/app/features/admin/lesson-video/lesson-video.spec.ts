import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { AuthService } from '../../../core/auth/auth.service';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import {
  TUS_UPLOAD_FACTORY,
  TusTransferOptions,
} from './tus-upload.factory';
import {
  BUNNY_TUS_ENDPOINT,
  VIDEO_UPLOAD_NOW,
  VIDEO_UPLOAD_TIMING,
} from './video-upload-contract';
import { LessonVideo } from './lesson-video';

const lesson = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherLesson = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const course = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const video = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherVideo = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const uploadId = '11111111-2222-4333-8444-555555555555';
const NOW = 1_700_000_000;
const limits = { maxBytes: 1_000_000, allowedMimeTypes: ['video/mp4'] };
const baseStatus = { state: 'none', hasVideo: false, limits };

function grant(overrides: Record<string, unknown> = {}): unknown {
  return {
    uploadId,
    endpoint: BUNNY_TUS_ENDPOINT,
    libraryId: '123456',
    videoId: video,
    expiresAt: NOW + 3600,
    signature: 'firma-ficticia',
    limits,
    ...overrides,
  };
}

function failure(status: number, message = 'HTTP'): unknown {
  return Object.assign(new Error(message), { context: { status } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

interface FakeUpload {
  options: TusTransferOptions;
  start: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  findPreviousUploads: ReturnType<typeof vi.fn>;
  resumeFromPreviousUpload: ReturnType<typeof vi.fn>;
}

describe('LessonVideo · subida Bunny desde el panel', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let tusCreate: ReturnType<typeof vi.fn>;
  let created: FakeUpload[];
  let session: ReturnType<typeof signal<{ user: { id: string } } | null>>;
  let statusQueue: Array<{ data?: unknown; error?: unknown }>;
  let defaultStatus: unknown;
  let prepareData: unknown;
  let prepareResponse: unknown;
  let refreshData: unknown;
  let refreshResponse: unknown;
  let previousUploads: unknown;
  let linkData: unknown;

  beforeEach(() => {
    vi.useRealTimers();
    invoke = vi.fn();
    created = [];
    statusQueue = [];
    defaultStatus = { data: baseStatus, error: null };
    prepareData = grant();
    prepareResponse = undefined;
    refreshData = grant();
    refreshResponse = undefined;
    previousUploads = [{ uploadUrl: 'https://video.bunnycdn.com/tusupload/resumible' }];
    linkData = { data: { linkage: 'linked', status: 'ready' }, error: null };
    session = signal<{ user: { id: string } } | null>({ user: { id: 'admin-1' } });

    invoke.mockImplementation(async (name: string, options: { body?: Record<string, unknown> } = {}) => {
      if (name === 'link-lesson-video') return linkData;
      const action = options.body?.['action'];
      if (action === 'status') return statusQueue.shift() ?? defaultStatus;
      if (action === 'prepare') return prepareResponse !== undefined ? prepareResponse : { data: prepareData, error: null };
      if (action === 'refresh') return refreshResponse !== undefined ? refreshResponse : { data: refreshData, error: null };
      return { data: null, error: null };
    });

    tusCreate = vi.fn(async (_file: File, options: TusTransferOptions) => {
      const upload: FakeUpload = {
        options,
        start: vi.fn(),
        abort: vi.fn().mockResolvedValue(undefined),
        findPreviousUploads: vi.fn().mockResolvedValue(previousUploads),
        resumeFromPreviousUpload: vi.fn(),
      };
      created.push(upload);
      return upload;
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: SUPABASE_CLIENT, useValue: { functions: { invoke } } },
        { provide: TUS_UPLOAD_FACTORY, useValue: { create: tusCreate } },
        { provide: AuthService, useValue: { session: session.asReadonly() } },
        { provide: VIDEO_UPLOAD_NOW, useValue: () => NOW },
        { provide: VIDEO_UPLOAD_TIMING, useValue: { pollIntervalMs: 1, pollAttempts: 2, retryDelays: [] } },
      ],
    });
  });

  async function settle(fixture: ComponentFixture<LessonVideo>, ms = 0): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(lessonId = lesson): Promise<ComponentFixture<LessonVideo>> {
    const fixture = TestBed.createComponent(LessonVideo);
    fixture.componentRef.setInput('lessonId', lessonId);
    fixture.componentRef.setInput('courseId', course);
    fixture.componentRef.setInput('lessonTitle', 'Lección de prueba');
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  function pickFile(fixture: ComponentFixture<LessonVideo>, file?: File): File {
    const chosen = file ?? new File([new Uint8Array(100)], 'leccion.mp4', { type: 'video/mp4', lastModified: 7 });
    fixture.componentInstance.onFileSelected({ target: { files: [chosen] } } as unknown as Event);
    return chosen;
  }

  function prepareCalls(): Array<{ action?: unknown }> {
    return invoke.mock.calls.map((call) => call[1]?.body).filter((body) => body?.['action'] === 'prepare');
  }

  async function readyToResume(fixture: ComponentFixture<LessonVideo>): Promise<void> {
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    fixture.componentInstance.cancelUpload();
    await settle(fixture);
  }

  it('lee el estado al abrir sin crear ni firmar nada', async () => {
    const fixture = await setup();
    expect(invoke).toHaveBeenCalledWith('video-upload', { body: { action: 'status', lessonId: lesson } });
    expect(prepareCalls()).toHaveLength(0);
    expect(tusCreate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.uploadState()).toBe('idle');
  });

  it('con vídeo ya asociado bloquea la subida y conserva el formulario de GUID', async () => {
    defaultStatus = { data: { state: 'ready', hasVideo: true, limits, durationSeconds: 120 }, error: null };
    const fixture = await setup();
    expect(fixture.nativeElement.textContent).toContain('Ya hay un vídeo asociado');
    pickFile(fixture);
    await settle(fixture);
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    expect(prepareCalls()).toHaveLength(0);
    expect(fixture.componentInstance.videoId).toBe('');
    fixture.componentInstance.reveal();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('#video-guid')).not.toBeNull();
    fixture.componentInstance.requestReplace();
    await settle(fixture);
    expect(fixture.componentInstance.canSubmit()).toBe(true);
  });

  it('seleccionar un archivo no crea ni envía bytes', async () => {
    const fixture = await setup();
    const before = invoke.mock.calls.length;
    pickFile(fixture);
    await settle(fixture);
    expect(invoke.mock.calls.length).toBe(before);
    expect(tusCreate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.canSubmit()).toBe(true);
  });

  it('solo tras pulsar Subir prepara, usa las cabeceras TUS del contrato y muestra progreso real', async () => {
    const fixture = await setup();
    const file = pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);

    const prepare = prepareCalls()[0] as Record<string, unknown> | undefined;
    expect(prepare).toMatchObject({
      action: 'prepare', lessonId: lesson, fileName: 'leccion.mp4', fileSize: 100, mimeType: 'video/mp4',
    });
    expect(prepare?.['requestId']).toMatch(/^[0-9a-f-]{36}$/);
    expect(tusCreate).toHaveBeenCalledTimes(1);

    const options = created[0].options;
    expect(options.endpoint).toBe(BUNNY_TUS_ENDPOINT);
    expect(options.headers).toEqual({
      AuthorizationSignature: 'firma-ficticia',
      AuthorizationExpire: String(NOW + 3600),
      LibraryId: '123456',
      VideoId: video,
    });
    expect(options.metadata).toEqual({ title: 'leccion.mp4', filetype: 'video/mp4' });
    expect(await options.fingerprint(file)).toContain(lesson);
    expect(await options.fingerprint(file)).toContain(video);
    expect(created[0].start).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.uploadState()).toBe('uploading');

    options.onProgress(40, 100);
    await settle(fixture);
    expect(fixture.componentInstance.progressPercent()).toBe(40);
    const bar = fixture.nativeElement.querySelector('[role=progressbar]');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toContain('40 %');
  });

  it('prepara y arranca con crypto sin randomUUID ni subtle (origen DEV no seguro)', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        bytes.fill(0);
        return array;
      },
    });
    try {
      expect((globalThis.crypto as { randomUUID?: unknown }).randomUUID).toBeUndefined();
      expect((globalThis.crypto as { subtle?: unknown }).subtle).toBeUndefined();

      const fixture = await setup();
      pickFile(fixture);
      await fixture.componentInstance.startUpload();
      await settle(fixture);

      const prepare = prepareCalls()[0] as Record<string, unknown> | undefined;
      expect(prepare?.['requestId']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(tusCreate).toHaveBeenCalledTimes(1);
      expect(created[0].start).toHaveBeenCalledTimes(1);
      expect(created[0].options.headers['VideoId']).toBe(video);
      expect(fixture.componentInstance.uploadState()).toBe('uploading');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('el 100 % pasa a procesando y solo se declara listo tras un GET validado', async () => {
    const fixture = await setup();
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    statusQueue.push({ data: { state: 'processing', hasVideo: false, limits, uploadId }, error: null });
    created[0].options.onSuccess();
    await settle(fixture, 10);

    expect(fixture.componentInstance.uploadState()).toBe('processing');
    expect(fixture.nativeElement.textContent).toContain('procesándose');
    expect(fixture.nativeElement.textContent).not.toContain('Listo');

    defaultStatus = { data: { state: 'ready', hasVideo: true, limits, uploadId, durationSeconds: 125 }, error: null };
    await fixture.componentInstance.refreshStatus();
    await settle(fixture);
    expect(fixture.componentInstance.uploadState()).toBe('done');
    expect(fixture.nativeElement.textContent).toContain('Listo');
    expect(fixture.nativeElement.textContent).toContain('2:05');
    expect(tusCreate).toHaveBeenCalledTimes(1);

    await fixture.componentInstance.refreshStatus();
    await settle(fixture);
    const last = invoke.mock.calls.at(-1)?.[1].body as Record<string, unknown>;
    expect(last).toEqual({ action: 'status', lessonId: lesson });
  });

  it('detener aborta con false sin terminar ni borrar el vídeo remoto', async () => {
    const fixture = await setup();
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    fixture.componentInstance.cancelUpload();
    await settle(fixture);

    expect(created[0].abort).toHaveBeenCalledWith(false);
    expect(created[0].abort).toHaveBeenCalledTimes(1);
    expect(tusCreate).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.uploadState()).toBe('paused');
    expect(fixture.nativeElement.textContent).toContain('se conserva');
  });

  it('reanuda con refresh conservando el GUID y reutilizando la URL guardada', async () => {
    const fixture = await setup();
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    fixture.componentInstance.cancelUpload();
    await settle(fixture);
    await fixture.componentInstance.resumeUpload();
    await settle(fixture);

    const refresh = invoke.mock.calls.find((call) => call[1]?.body?.['action'] === 'refresh');
    expect(refresh?.[1].body).toEqual({ action: 'refresh', lessonId: lesson, uploadId });
    expect(created).toHaveLength(2);
    expect(created[1].options.headers['VideoId']).toBe(video);
    expect(created[1].findPreviousUploads).toHaveBeenCalledTimes(1);
    expect(created[1].resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: expect.any(String) });
    expect(created[1].start).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.uploadState()).toBe('uploading');
  });

  it('rechaza un refresh con otro GUID sin iniciar una nueva subida', async () => {
    const fixture = await setup();
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    fixture.componentInstance.cancelUpload();
    await settle(fixture);
    refreshData = grant({ videoId: otherVideo });
    await fixture.componentInstance.resumeUpload();
    await settle(fixture);

    expect(fixture.componentInstance.uploadState()).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('vídeo distinto');
    expect(created).toHaveLength(1);
    expect(created[0].start).toHaveBeenCalledTimes(1);
  });

  it('ignora una respuesta prepare obsoleta tras cambiar de archivo, de lección o de sesión', async () => {
    const pending = deferred<unknown>();
    prepareResponse = pending.promise;
    const fixture = await setup();
    pickFile(fixture);
    void fixture.componentInstance.startUpload();
    await settle(fixture);
    expect(fixture.componentInstance.uploadState()).toBe('preparing');

    pickFile(fixture, new File([new Uint8Array(50)], 'otro.mp4', { type: 'video/mp4', lastModified: 9 }));
    await settle(fixture);
    pending.resolve({ data: grant(), error: null });
    await settle(fixture);
    expect(tusCreate).not.toHaveBeenCalled();

    const pending2 = deferred<unknown>();
    prepareResponse = pending2.promise;
    pickFile(fixture);
    void fixture.componentInstance.startUpload();
    await settle(fixture);
    fixture.componentRef.setInput('lessonId', otherLesson);
    await settle(fixture);
    pending2.resolve({ data: grant(), error: null });
    await settle(fixture);
    expect(tusCreate).not.toHaveBeenCalled();

    const pending3 = deferred<unknown>();
    prepareResponse = pending3.promise;
    pickFile(fixture);
    void fixture.componentInstance.startUpload();
    await settle(fixture);
    session.set(null);
    await settle(fixture);
    pending3.resolve({ data: grant(), error: null });
    await settle(fixture);
    expect(tusCreate).not.toHaveBeenCalled();
  });

  it('no inicia la subida si el componente se destruye antes de la respuesta', async () => {
    const pending = deferred<unknown>();
    prepareResponse = pending.promise;
    const fixture = await setup();
    pickFile(fixture);
    void fixture.componentInstance.startUpload();
    await settle(fixture);
    fixture.destroy();
    pending.resolve({ data: grant(), error: null });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(tusCreate).not.toHaveBeenCalled();
  });

  it('valida ausencia de archivo, tamaño y tipo sin llegar a pedir prepare', async () => {
    const fixture = await setup();
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    expect(prepareCalls()).toHaveLength(0);

    pickFile(fixture, new File([new Uint8Array(1_000_001)], 'grande.mp4', { type: 'video/mp4' }));
    await settle(fixture);
    expect(fixture.componentInstance.fileError()).toContain('tamaño');
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    expect(prepareCalls()).toHaveLength(0);

    pickFile(fixture, new File(['x'], 'texto.txt', { type: 'text/plain' }));
    await settle(fixture);
    expect(fixture.componentInstance.fileError()).toContain('tipo');
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    expect(prepareCalls()).toHaveLength(0);
    expect(tusCreate).not.toHaveBeenCalled();
  });

  it('rechaza una concesión con endpoint arbitrario y no filtra la firma en el DOM', async () => {
    prepareData = grant({ endpoint: 'https://atacante.example/tusupload', signature: 'FIRMA-SECRETA-XYZ' });
    const fixture = await setup();
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);

    expect(fixture.componentInstance.uploadState()).toBe('error');
    expect(tusCreate).not.toHaveBeenCalled();
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('FIRMA-SECRETA-XYZ');
    expect(text).not.toContain('atacante');
  });

  it('muestra mensajes honestos para 401, 409 y 502 sin filtrar secretos', async () => {
    const secret = 'apiKey=SECRETO&signature=FIRMA&url=https://malicioso';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cases: Array<[number, string]> = [
      [401, 'Inicia sesión'],
      [409, 'no se ha creado otro'],
      [502, 'proveedor'],
    ];
    for (const [status, expected] of cases) {
      prepareResponse = Promise.resolve({ data: null, error: failure(status, secret) });
      const fixture = await setup();
      pickFile(fixture);
      await fixture.componentInstance.startUpload();
      await settle(fixture);
      expect(fixture.componentInstance.uploadState()).toBe('error');
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain(expected);
      expect(text).not.toContain('SECRETO');
      expect(text).not.toContain('FIRMA');
      expect(text).not.toContain('malicioso');
      expect(text).not.toContain(secret);
      fixture.destroy();
    }
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('un 401 del TUS exige renovación y solo reintenta 409/423, sin bucles de coste', async () => {
    const fixture = await setup();
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    const options = created[0].options;

    expect(options.onShouldRetry(401, 0)).toBe(false);
    expect(options.onShouldRetry(409, 0)).toBe(true);
    expect(options.onShouldRetry(423, 0)).toBe(true);
    expect(options.onShouldRetry(500, 0)).toBe(false);

    options.onError({ originalResponse: { getStatus: () => 401 } });
    await settle(fixture);
    expect(fixture.componentInstance.uploadState()).toBe('error');
    expect(fixture.componentInstance.needsRenewal()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Inicia sesión de nuevo');
  });

  it('sondea un número acotado de veces, no se repite y limpia al destruir', async () => {
    const fixture = await setup();
    pickFile(fixture);
    await fixture.componentInstance.startUpload();
    await settle(fixture);
    created[0].options.onSuccess();
    await settle(fixture, 60);

    const statusCalls = () => invoke.mock.calls.filter((call) => call[1]?.body?.['action'] === 'status').length;
    expect(statusCalls()).toBeLessThanOrEqual(3);
    expect(fixture.componentInstance.uploadState()).toBe('processing');
    expect(fixture.nativeElement.textContent).toContain('Actualizar estado');
    const afterPoll = statusCalls();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(statusCalls()).toBe(afterPoll);
    fixture.destroy();
    expect((fixture.componentInstance as unknown as { pollTimer: unknown }).pollTimer).toBeNull();
  });

  it('rechaza URLs de reanudación manipuladas sin delegar, sin bytes y sin filtrar la URL', async () => {
    const malicious = [
      'https://evil.example/tusupload/abc',
      'https://user:pass@video.bunnycdn.com/tusupload/abc',
      'https://video.bunnycdn.com@evil.example/tusupload/abc',
      'http://video.bunnycdn.com/tusupload/abc',
      'https://video.bunnycdn.com:8443/tusupload/abc',
      'https://video.bunnycdn.com/otro/abc',
      'https://video.bunnycdn.com/tusupload/../abc',
      'https://video.bunnycdn.com/tusupload/abc?token=x',
      'javascript:alert(1)',
      'https://',
      'https://video.bunnycdn.com.evil.example/tusupload/abc',
    ];
    for (const url of malicious) {
      const fixture = await setup();
      await readyToResume(fixture);
      const beforePrepare = prepareCalls().length;
      previousUploads = [{ uploadUrl: url }];
      await fixture.componentInstance.resumeUpload();
      await settle(fixture);

      expect(fixture.componentInstance.uploadState()).toBe('error');
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('No se ha podido reanudar');
      expect(text).not.toContain(url);
      const last = created.at(-1) as FakeUpload;
      expect(last.resumeFromPreviousUpload).not.toHaveBeenCalled();
      expect(last.start).not.toHaveBeenCalled();
      expect(fixture.componentInstance.progress()).toEqual({ sent: 0, total: 0 });
      expect(prepareCalls()).toHaveLength(beforePrepare);
      fixture.destroy();
    }
  });

  it('acepta Location oficial absoluto o relativo y reanuda con el mismo GUID', async () => {
    const official = 'https://video.bunnycdn.com/tusupload/abc-123';
    for (const [stored, canonical] of [
      [official, official],
      ['/tusupload/abc-123', official],
      ['abc-123', official],
    ]) {
      const fixture = await setup();
      await readyToResume(fixture);
      previousUploads = [{ uploadUrl: 'https://evil.example/x' }, { uploadUrl: stored }];
      await fixture.componentInstance.resumeUpload();
      await settle(fixture);

      const last = created.at(-1) as FakeUpload;
      expect(last.resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: canonical });
      expect(last.start).toHaveBeenCalledTimes(1);
      expect(last.options.headers['VideoId']).toBe(video);
      expect(last.options.headers['AuthorizationSignature']).toBe('firma-ficticia');
      expect(fixture.componentInstance.uploadState()).toBe('uploading');
      const refresh = invoke.mock.calls.find((call) => call[1]?.body?.['action'] === 'refresh');
      expect(refresh?.[1].body).toEqual({ action: 'refresh', lessonId: lesson, uploadId });
      fixture.destroy();
    }
  });

  it('no reanuda si cambia la sesión mientras se lee la URL guardada', async () => {
    const fixture = await setup();
    await readyToResume(fixture);
    const pending = deferred<Array<{ uploadUrl: string }>>();
    previousUploads = pending.promise;
    void fixture.componentInstance.resumeUpload();
    await settle(fixture);
    session.set(null);
    await settle(fixture);
    pending.resolve([{ uploadUrl: 'https://video.bunnycdn.com/tusupload/abc' }]);
    await settle(fixture);

    const last = created.at(-1) as FakeUpload;
    expect(last.resumeFromPreviousUpload).not.toHaveBeenCalled();
    expect(last.start).not.toHaveBeenCalled();
    expect(prepareCalls()).toHaveLength(1);
  });

  it('no reanuda ni recrea si la lección cambia mientras refresh está pendiente', async () => {
    const fixture = await setup();
    await readyToResume(fixture);
    const pending = deferred<unknown>();
    refreshResponse = pending.promise;
    void fixture.componentInstance.resumeUpload();
    await settle(fixture);
    fixture.componentRef.setInput('lessonId', otherLesson);
    await settle(fixture);
    pending.resolve({ data: grant(), error: null });
    await settle(fixture);

    expect(tusCreate).toHaveBeenCalledTimes(1);
    expect(created[0].start).toHaveBeenCalledTimes(1);
    expect(prepareCalls()).toHaveLength(1);
  });

  it('conserva la vinculación por GUID existente y su foco accesible', async () => {
    const fixture = await setup();
    fixture.componentInstance.reveal();
    await settle(fixture);
    const input = fixture.nativeElement.querySelector('#video-guid') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    fixture.componentInstance.videoId = video;
    await fixture.componentInstance.link();
    await settle(fixture);
    expect(invoke).toHaveBeenCalledWith('link-lesson-video', { body: { lessonId: lesson, videoId: video } });
    expect(fixture.componentInstance.state()).toBe('vinculado');
    expect(fixture.componentInstance.videoId).toBe('');
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain(video);
  });

  it('no expone mensajes del servidor al vincular por GUID', async () => {
    linkData = { data: null, error: failure(500, 'HTTP secreto') };
    const fixture = await setup();
    fixture.componentInstance.reveal();
    fixture.componentInstance.videoId = video;
    await fixture.componentInstance.link();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No se pudo completar');
    expect(fixture.nativeElement.textContent).not.toContain('HTTP secreto');
  });
});
