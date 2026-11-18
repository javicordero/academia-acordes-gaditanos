import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import {
  TUS_UPLOAD_FACTORY,
  TusUploadLike,
} from './tus-upload.factory';
import {
  INVALID_RESUME_MESSAGE,
  InvalidResumeUrlError,
  InvalidUploadResponseError,
  UploadGrant,
  UploadHttpError,
  UploadStatus,
  VIDEO_UPLOAD_TIMING,
  fileSeed,
  fileValidationError,
  formatBytes,
  formatDuration,
  resolveBunnyTusResumeUrl,
  stableRequestId,
  statusMessage,
  uploadHttpMessage,
} from './video-upload-contract';
import { VideoUploadService } from './video-upload.service';
import {
  UPLOAD_TOAST_TIMING,
  ToastHold,
  UploadToast,
  UploadToasts,
} from './upload-toasts.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONFLICT_MESSAGE =
  'Conflicto: ese vídeo ya está reservado para otra lección. No se ha creado otro; elige otro archivo o sustituye el vídeo expresamente.';

type State = 'idle' | 'validando' | 'vinculado' | 'error' | 'sin-config' | 'sin-video';
type LinkResult = { linkage: 'linked' | 'linked_yet'; status: 'ready' | 'processing' };
type UploadPhase =
  | 'loading'
  | 'idle'
  | 'ready-file'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'done'
  | 'error';
type ToastStage = 'preparacion' | 'reanudacion' | 'transferencia' | 'estado' | 'conflicto';

function statusOf(error: unknown): number | null {
  const context = (error as { context?: unknown } | null)?.context as { status?: unknown } | null;
  return context && typeof context.status === 'number' ? context.status : null;
}

@Component({
  selector: 'app-lesson-video',
  imports: [FormsModule],
  templateUrl: './lesson-video.html',
  styleUrl: './lesson-video.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Ámbito de componente: los avisos mueren con esta vista, sin compartir
  // estado con otras pantallas del panel ni con un host global.
  providers: [UploadToasts],
})
export class LessonVideo {
  readonly lessonId = input('');
  readonly lessonTitle = input('');
  readonly courseId = input('');
  /** Compatibilidad con hosts que pasan la ruta de origen; el host decide la navegación. */
  readonly returnUrl = input('');

  private readonly route = inject(ActivatedRoute, { optional: true });
  // La ruta puede reutilizar este componente al pasar de :lessonId a otro:
  // paramMap es reactivo, a diferencia de route.snapshot.
  private readonly routeParams = toSignal(
    this.route?.paramMap ?? of(convertToParamMap({})),
    { initialValue: this.route?.snapshot.paramMap ?? convertToParamMap({}) },
  );
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly guidInput = viewChild<ElementRef<HTMLInputElement>>('guidInput');
  private generation = 0;

  // --- Subida desde el panel -------------------------------------------------
  private readonly uploads = inject(VideoUploadService);
  private readonly tusFactory = inject(TUS_UPLOAD_FACTORY);
  private readonly auth = inject(AuthService, { optional: true });
  private readonly timing = inject(VIDEO_UPLOAD_TIMING);
  private readonly toastStore = inject(UploadToasts);
  private readonly toastTiming = inject(UPLOAD_TOAST_TIMING);
  private uploadGeneration = 0;
  private activeUpload: TusUploadLike | null = null;
  private grant: UploadGrant | null = null;
  private currentRequestId: string | null = null;
  private statusLoading = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollWake: (() => void) | null = null;
  private observedLessonId = '';
  private observedSession: string | undefined;

  readonly effectiveLessonId = computed(() =>
    this.lessonId() || this.routeParams().get('lessonId') || '',
  );
  readonly effectiveCourseId = computed(() =>
    this.courseId() || this.routeParams().get('courseId') || '',
  );
  readonly canEdit = computed(() => UUID.test(this.effectiveLessonId()));

  readonly state = signal<State>('idle');
  readonly message = signal('');
  readonly invalidGuid = signal(false);
  readonly formVisible = signal(false);
  readonly result = signal<LinkResult | null>(null);

  readonly uploadState = signal<UploadPhase>('loading');
  readonly uploadMessage = signal('');
  readonly fileError = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly progress = signal({ sent: 0, total: 0 });
  readonly statusInfo = signal<UploadStatus | null>(null);
  readonly needsRenewal = signal(false);
  readonly replaceRequested = signal(false);

  /** Avisos accesibles de la subida (signal de solo lectura del almacén local). */
  readonly toasts = this.toastStore.toasts;

  readonly limits = computed(() => this.statusInfo()?.limits ?? null);
  readonly acceptTypes = computed(() => (this.limits()?.allowedMimeTypes ?? []).join(','));
  readonly limitsText = computed(() => {
    const limits = this.limits();
    return limits
      ? `Tamaño máximo ${formatBytes(limits.maxBytes)}. Tipos permitidos: ${limits.allowedMimeTypes.join(', ')}.`
      : '';
  });
  readonly existingVideo = computed(() => this.statusInfo()?.hasVideo === true);
  readonly existingBlock = computed(() => this.existingVideo() && !this.replaceRequested());
  readonly isBusy = computed(() =>
    this.uploadState() === 'preparing' || this.uploadState() === 'uploading',
  );
  readonly canSubmit = computed(() =>
    this.canEdit() &&
    !!this.selectedFile() &&
    !this.fileError() &&
    !this.isBusy() &&
    !this.existingBlock() &&
    this.uploadState() !== 'loading',
  );
  readonly progressPercent = computed(() => {
    const { sent, total } = this.progress();
    return total > 0 ? Math.min(100, Math.max(0, Math.round((sent / total) * 100))) : 0;
  });
  readonly progressText = computed(() => {
    const { sent, total } = this.progress();
    return `${formatBytes(sent)} de ${formatBytes(total)} (${this.progressPercent()} %)`;
  });

  videoId = '';

  constructor() {
    this.destroy.onDestroy(() => {
      this.generation++;
      this.invalidate(null);
      this.toastStore.clear();
    });

    // Detecta cambio de lección, ruta o sesión (incluido logout). Un refresh de
    // token con el mismo usuario no cambia la clave: no reinicia la subida.
    effect(() => {
      const lessonId = this.effectiveLessonId();
      const session = this.auth?.session()?.user.id ?? 'anon';
      const previousLesson = this.observedLessonId;
      const previousSession = this.observedSession;
      this.observedLessonId = lessonId;
      this.observedSession = session;

      const lessonChanged = previousLesson !== lessonId;
      const sessionChanged = previousSession !== undefined && previousSession !== session;
      if (lessonChanged || sessionChanged) {
        // Cambio de lección (la ruta reutiliza el componente) o de sesión:
        // nada de la lección anterior puede seguir vivo ni anunciarse.
        this.resetForLesson(lessonId);
      }
      if (!lessonId && this.uploadState() !== 'loading') this.uploadState.set('idle');
      if (lessonId && (lessonChanged || previousLesson === undefined || sessionChanged)) {
        void this.loadStatus();
      }
    });
  }

  /** Descarta subida, temporizadores, avisos y estado editorial de otra lección. */
  private resetForLesson(lessonId: string): void {
    this.invalidate(null); // abort(false): no borra el vídeo remoto.
    this.toastStore.clear();
    this.generation++; // descarta respuestas pendientes de vinculación por GUID.
    this.state.set('idle');
    this.message.set('');
    this.result.set(null);
    this.videoId = '';
    this.invalidGuid.set(false);
    this.formVisible.set(false);
    this.selectedFile.set(null);
    this.fileError.set(null);
    this.grant = null;
    this.currentRequestId = null;
    this.replaceRequested.set(false);
    this.statusInfo.set(null);
    this.uploadMessage.set('');
    this.statusLoading = false;
    this.uploadState.set(lessonId ? 'loading' : 'idle');
  }

  // --- Vinculación por GUID (flujo existente, intacto) -----------------------

  reveal(): void {
    if (!this.canEdit()) return;
    this.formVisible.set(true);
    if (this.state() !== 'vinculado') {
      this.state.set('sin-video');
      this.message.set('Todavía no se ha comprobado ningún vídeo. Indica el GUID para verificarlo y vincularlo.');
    }
    afterNextRender(() => {
      if (!this.destroy.destroyed) this.guidInput()?.nativeElement.focus();
    }, { injector: this.injector });
  }

  clearGuid(): void { this.invalidGuid.set(false); }

  async link(): Promise<void> {
    const lessonId = this.effectiveLessonId();
    const generation = ++this.generation;
    if (!UUID.test(lessonId) || this.state() === 'validando') return;

    const videoId = this.videoId.trim();
    this.invalidGuid.set(!UUID.test(videoId));
    if (this.invalidGuid()) {
      this.state.set('error');
      this.message.set('Indica un GUID válido de Bunny: un UUID en minúsculas.');
      return;
    }
    if (!this.client) {
      this.state.set('sin-config');
      this.message.set('La conexión con el servidor no está configurada; no se ha guardado nada.');
      return;
    }

    this.state.set('validando');
    this.result.set(null);
    this.message.set('Comprobando el vídeo en el servidor y vinculándolo…');
    try {
      const { data, error } = await this.client.functions.invoke('link-lesson-video', {
        body: { lessonId, videoId },
      });
      if (generation !== this.generation || this.destroy.destroyed) return;
      if (error) {
        this.handleError(error);
        return;
      }
      const value = data as Partial<LinkResult> | null;
      if (!value || (value.linkage !== 'linked' && value.linkage !== 'linked_yet') ||
          (value.status !== 'ready' && value.status !== 'processing')) {
        this.state.set('error');
        this.message.set('El servidor devolvió una respuesta no válida; no se puede confirmar el vínculo.');
        return;
      }
      this.result.set({ linkage: value.linkage, status: value.status });
      this.state.set('vinculado');
      this.message.set(value.linkage === 'linked'
        ? 'Vídeo verificado y vinculado a la lección.'
        : 'El vídeo ya estaba vinculado a esta lección.');
      // El GUID no se conserva en el DOM: solo el resultado de la operación.
      this.videoId = '';
    } catch {
      if (generation !== this.generation || this.destroy.destroyed) return;
      this.state.set('error');
      this.message.set('No se pudo completar la vinculación. Comprueba la conexión e inténtalo de nuevo.');
    }
  }

  private handleError(error: unknown): void {
    const status = statusOf(error);
    if (status === 403) {
      this.state.set('error');
      this.message.set('Tu cuenta no tiene permisos de administración para vincular vídeos.');
    } else if (status === 503) {
      this.state.set('sin-config');
      this.message.set('El servidor no tiene configurada la biblioteca de vídeo; no se ha guardado nada.');
    } else if (status === 502) {
      this.state.set('error');
      this.message.set('No se pudo verificar el vídeo en el proveedor; no se ha guardado nada.');
    } else if (status === 409) {
      this.state.set('error');
      this.message.set('Ese vídeo ya está vinculado a otra lección; no se ha cambiado nada.');
    } else {
      this.state.set('error');
      this.message.set('No se pudo completar la vinculación. Comprueba la conexión e inténtalo de nuevo.');
    }
  }

  // --- Subida TUS desde el panel ---------------------------------------------

  /** `status` solo lee: nunca crea, firma ni sube bytes. */
  private async loadStatus(): Promise<void> {
    const lessonId = this.effectiveLessonId();
    if (!this.canEdit() || !lessonId) {
      this.uploadState.set('idle');
      return;
    }
    const generation = this.uploadGeneration;
    try {
      const status = await this.uploads.status(lessonId);
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      this.statusInfo.set(status);
      this.uploadMessage.set(statusMessage(status));
      if (status.state === 'failed' || status.state === 'blocked') {
        this.uploadState.set('error');
      } else if (this.uploadState() === 'loading' || this.uploadState() === 'error') {
        this.uploadState.set('idle');
      }
    } catch (error) {
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      const text = this.safeError(error);
      this.uploadState.set('error');
      this.uploadMessage.set(text);
      this.pushError(text, 'estado', generation, () => void this.refreshStatus());
    }
  }

  /**
   * Relectura manual: `action: 'status'` consulta el estado real en el servidor
   * (y este a Bunny para los trabajos activos). No es `action: 'refresh'`:
   * aquí no se renueva ninguna firma ni se crea ni sube ningún objeto.
   */
  async refreshStatus(): Promise<void> {
    if (this.statusLoading || this.isBusy()) return;
    this.statusLoading = true;
    const generation = this.uploadGeneration;
    try {
      const status = await this.uploads.status(this.effectiveLessonId(), this.grant?.uploadId);
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      this.statusInfo.set(status);
      this.interpretStatus(status, generation);
    } catch (error) {
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      const text = this.safeError(error);
      this.uploadState.set('error');
      this.uploadMessage.set(text);
      this.pushError(text, 'estado', generation, () => void this.refreshStatus());
    } finally {
      this.statusLoading = false;
    }
  }

  private interpretStatus(status: UploadStatus, generation: number): void {
    if (generation !== this.uploadGeneration) return;
    if (status.state === 'ready' && status.hasVideo) {
      this.markReady(status);
      return;
    }
    if (status.state === 'failed' || status.state === 'blocked') {
      const text = statusMessage(status);
      this.uploadState.set('error');
      this.uploadMessage.set(text);
      this.pushError(text, 'estado', generation, () => void this.refreshStatus());
      return;
    }
    const previous = this.uploadState();
    if (previous === 'processing' || previous === 'done') {
      this.uploadState.set('processing');
      this.uploadMessage.set(statusMessage(status));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    // Cambiar de archivo (incluso por el mismo) descarta los avisos anteriores.
    this.toastStore.clear();
    this.invalidate(null);
    this.selectedFile.set(file);
    this.grant = null;
    this.currentRequestId = null;
    this.needsRenewal.set(false);
    if (!file) {
      this.fileError.set(null);
      this.uploadState.set('idle');
      return;
    }
    this.currentRequestId = stableRequestId([
      this.effectiveLessonId(), file.name, String(file.size), file.type, String(file.lastModified),
    ].join('|'));
    this.fileError.set(fileValidationError(file, this.limits()));
    this.uploadState.set('ready-file');
    if (!this.fileError()) {
      this.uploadMessage.set('Archivo seleccionado. Revisa el aviso de coste y pulsa «Subir a Bunny».');
    }
  }

  /** Ninguna petición de creación ni bytes antes de este gesto del administrador. */
  async startUpload(): Promise<void> {
    const lessonId = this.effectiveLessonId();
    const file = this.selectedFile();
    if (!this.canEdit() || !file || this.isBusy() || this.existingBlock()) return;
    const error = fileValidationError(file, this.limits());
    this.fileError.set(error);
    if (error) return;

    const generation = ++this.uploadGeneration;
    this.cancelPoll();
    this.toastStore.clear();
    this.uploadState.set('preparing');
    this.uploadMessage.set('Solicitando autorización de subida…');
    this.needsRenewal.set(false);
    this.pushInfo('Preparando la subida del vídeo…', `preparando-${generation}`);

    try {
      const requestId = this.currentRequestId ?? stableRequestId([
        lessonId, file.name, String(file.size), file.type, String(file.lastModified),
      ].join('|'));
      const grant = await this.uploads.prepare(lessonId, requestId, file.name, file.size, file.type);
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      this.grant = grant;
      await this.beginTransfer(file, grant, generation, false);
    } catch (e) {
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      this.activeUpload = null;
      const status = e instanceof UploadHttpError ? e.status : null;
      const text = status === 409 ? CONFLICT_MESSAGE : this.safeError(e);
      this.uploadState.set('error');
      this.uploadMessage.set(this.safeError(e));
      this.pushError(
        text,
        status === 409 ? 'conflicto' : 'preparacion',
        generation,
        () => this.retryUpload(),
      );
      this.needsRenewal.set(status === 401);
    }
  }

  /** Reanuda con el MISMO GUID: `refresh` no crea otro vídeo. */
  async resumeUpload(): Promise<void> {
    const file = this.selectedFile();
    const grant = this.grant;
    if (!this.canEdit() || !file || !grant || this.isBusy()) return;

    const generation = ++this.uploadGeneration;
    this.cancelPoll();
    this.toastStore.clear();
    this.uploadState.set('preparing');
    this.uploadMessage.set('Renovando la autorización para reanudar…');
    this.needsRenewal.set(false);
    this.pushInfo('Reanudando la subida con el mismo archivo…', `reanudando-${generation}`);

    try {
      const fresh = await this.uploads.refresh(this.effectiveLessonId(), grant.uploadId);
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      if (fresh.videoId !== grant.videoId || fresh.uploadId !== grant.uploadId) {
        const text = 'El servidor devolvió un vídeo distinto; no se ha reanudado ni creado otro.';
        this.uploadState.set('error');
        this.uploadMessage.set(text);
        this.pushError(text, 'reanudacion', generation, () => void this.startUpload());
        return;
      }
      this.grant = fresh;
      await this.beginTransfer(file, fresh, generation, true);
    } catch (e) {
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      const status = e instanceof UploadHttpError ? e.status : null;
      const text = status === 409 ? CONFLICT_MESSAGE : this.safeError(e);
      this.uploadState.set('error');
      this.uploadMessage.set(this.safeError(e));
      this.pushError(
        text,
        status === 409 ? 'conflicto' : 'reanudacion',
        generation,
        () => this.retryUpload(),
      );
      this.needsRenewal.set(status === 401);
    }
  }

  private async beginTransfer(
    file: File,
    grant: UploadGrant,
    generation: number,
    resume: boolean,
  ): Promise<void> {
    const upload = await this.tusFactory.create(file, {
      endpoint: grant.endpoint,
      headers: {
        AuthorizationSignature: grant.signature,
        AuthorizationExpire: String(grant.expiresAt),
        LibraryId: grant.libraryId,
        VideoId: grant.videoId,
      },
      metadata: { title: file.name, filetype: file.type },
      fingerprint: async (input) => fileSeed(this.effectiveLessonId(), grant.videoId, input),
      onProgress: (sent, total) => {
        if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
        this.progress.set({ sent, total });
        // El porcentaje exacto vive en la barra; solo se anuncian hitos, una vez.
        if (total > 0) {
          const percent = Math.min(100, Math.max(0, Math.round((sent / total) * 100)));
          for (const mark of [25, 50, 75]) {
            if (percent >= mark) {
              this.pushInfo(`Subida al ${mark} %.`, `hito-${generation}-${mark}`);
            }
          }
        }
      },
      onSuccess: () => {
        if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
        this.activeUpload = null;
        this.uploadState.set('processing');
        this.uploadMessage.set('Subida completada. El vídeo se está procesando en el servidor.');
        this.needsRenewal.set(false);
        // El 100 % NO es éxito: solo un GET validado puede declarar «Listo».
        void this.pollStatus(generation);
      },
      onError: (error) => {
        if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
        this.activeUpload = null;
        const status = this.tusStatus(error);
        const text = status === 409 ? CONFLICT_MESSAGE : uploadHttpMessage(status);
        this.uploadState.set('error');
        this.uploadMessage.set(uploadHttpMessage(status));
        this.pushError(
          text,
          status === 409 ? 'conflicto' : 'transferencia',
          generation,
          () => this.retryUpload(),
        );
        this.needsRenewal.set(status === 401);
      },
      // Según la documentación de tus: solo 409/423 se reintentan. 401 exige
      // acción del usuario para renovar; nunca se entra en un bucle de coste.
      onShouldRetry: (status) => status === 409 || status === 423,
      retryDelays: this.timing.retryDelays,
      removeFingerprintOnSuccess: true,
    });

    if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
    if (resume) {
      const candidates = await upload.findPreviousUploads();
      if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
      // Se valida cada registro antes de elegir: localStorage no es fiable y una
      // URL manipulada podría enviar las cabeceras firmadas a otro dominio.
      let safeUrl: string | null = null;
      for (const candidate of candidates) {
        safeUrl = resolveBunnyTusResumeUrl(candidate?.uploadUrl);
        if (safeUrl !== null) break;
      }
      if (safeUrl === null) {
        this.uploadState.set('error');
        this.uploadMessage.set(INVALID_RESUME_MESSAGE);
        this.pushError(INVALID_RESUME_MESSAGE, 'reanudacion', generation, () => void this.startUpload());
        return;
      }
      // Solo se reutiliza la URL verificada; la huella sigue ligada a esta
      // lección, a este GUID y a este archivo. Sin start(): cero bytes nuevos.
      upload.resumeFromPreviousUpload({ uploadUrl: safeUrl });
    }
    if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
    this.activeUpload = upload;
    this.progress.set({ sent: 0, total: file.size });
    this.uploadState.set('uploading');
    this.uploadMessage.set('Subiendo el vídeo…');
    this.pushInfo('Enviando el archivo al proveedor…', `enviando-${generation}`);
    upload.start();
  }

  /** Pausa local: `abort(false)` no termina ni borra el vídeo en el proveedor. */
  cancelUpload(): void {
    if (!this.activeUpload && !this.isBusy() && this.uploadState() !== 'uploading') return;
    this.invalidate('Subida detenida. El vídeo remoto se conserva; puedes reanudarlo con el mismo archivo.');
    this.pushInfo(
      'Subida detenida. El archivo no se ha borrado; reanuda con el mismo archivo.',
      `pausa-${this.uploadGeneration}`,
    );
  }

  /** Restituir el formulario de subida tras un vídeo ya asociado (gesto editorial). */
  requestReplace(): void {
    this.replaceRequested.set(true);
    this.uploadState.set('idle');
    this.uploadMessage.set('Puedes seleccionar un archivo para crear otro contenido. El vídeo asociado no se cambia hasta que termines la subida y el servidor lo confirme.');
  }

  private tusStatus(error: unknown): number | null {
    const response = (error as { originalResponse?: { getStatus?: () => number } } | null)?.originalResponse;
    const status = response?.getStatus?.();
    return typeof status === 'number' && Number.isInteger(status) ? status : null;
  }

  private markReady(status: UploadStatus): void {
    this.uploadState.set('done');
    const duration = typeof status.durationSeconds === 'number'
      ? ` Duración: ${formatDuration(status.durationSeconds)}.`
      : '';
    this.uploadMessage.set(`Listo. El vídeo está asociado a esta lección.${duration}`);
    this.toastStore.push({
      severity: 'success',
      title: 'Listo',
      text: `El vídeo ya está disponible en esta lección.${duration}`,
      dedupeKey: `listo-${this.uploadGeneration}`,
      autoHideMs: this.toastTiming.successMs,
    });
    this.needsRenewal.set(false);
    this.replaceRequested.set(false);
    // En `ready` el servidor omite uploadId: las siguientes lecturas no lo envían.
    this.grant = null;
    const total = this.progress().total;
    if (total > 0) this.progress.set({ sent: total, total });
  }

  /** Sondeo acotado: `pollAttempts` lecturas, cancelable en cualquier espera. */
  private async pollStatus(generation: number): Promise<void> {
    const lessonId = this.effectiveLessonId();
    for (let i = 0; i < this.timing.pollAttempts; i++) {
      const valid = await this.wait(this.timing.pollIntervalMs, generation);
      if (!valid || generation !== this.uploadGeneration || this.destroy.destroyed) return;
      try {
        const status = await this.uploads.status(lessonId, this.grant?.uploadId);
        if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
        this.statusInfo.set(status);
        if (status.state === 'ready' && status.hasVideo) {
          this.markReady(status);
          return;
        }
        if (status.state === 'failed' || status.state === 'blocked') {
          const text = statusMessage(status);
          this.uploadState.set('error');
          this.uploadMessage.set(text);
          this.pushError(text, 'estado', generation, () => void this.refreshStatus());
          return;
        }
        this.uploadState.set('processing');
        this.uploadMessage.set(statusMessage(status));
      } catch (e) {
        if (generation !== this.uploadGeneration || this.destroy.destroyed) return;
        const text = this.safeError(e);
        this.uploadState.set('error');
        this.uploadMessage.set(text);
        this.pushError(text, 'estado', generation, () => void this.refreshStatus());
        return;
      }
    }
    if (generation === this.uploadGeneration && !this.destroy.destroyed) {
      this.uploadState.set('processing');
      this.uploadMessage.set('Sigue procesándose. Pulsa «Actualizar estado» en unos momentos.');
    }
  }

  private wait(ms: number, generation: number): Promise<boolean> {
    return new Promise((resolve) => {
      const finish = (woke: boolean): void => {
        if (this.pollTimer !== null) clearTimeout(this.pollTimer);
        this.pollTimer = null;
        this.pollWake = null;
        resolve(woke && generation === this.uploadGeneration && !this.destroy.destroyed);
      };
      this.pollWake = () => finish(false);
      this.pollTimer = setTimeout(() => finish(true), ms);
    });
  }

  private cancelPoll(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    const wake = this.pollWake;
    this.pollWake = null;
    wake?.();
  }

  private invalidate(reason: string | null): void {
    this.uploadGeneration++;
    this.cancelPoll();
    const active = this.activeUpload;
    this.activeUpload = null;
    if (active) void active.abort(false);
    this.progress.set({ sent: 0, total: 0 });
    this.needsRenewal.set(false);
    if (reason) {
      this.uploadState.set('paused');
      this.uploadMessage.set(reason);
    }
  }

  // --- Avisos accesibles de la subida -----------------------------------------

  /** Informativo con autocierre; la clave fija el dedupe por motivo. */
  private pushInfo(text: string, dedupeKey: string): void {
    this.toastStore.push({
      severity: 'info',
      title: 'Aviso',
      text,
      dedupeKey,
      autoHideMs: this.toastTiming.infoMs,
    });
  }

  /** Error persistente con reintento: no se cierra solo y la clave evita repetirlo. */
  private pushError(
    text: string,
    stage: ToastStage,
    generation: number,
    retry: () => void,
  ): void {
    this.toastStore.push({
      severity: 'error',
      title: stage === 'conflicto' ? 'Conflicto' : 'Error',
      text,
      dedupeKey: `error-${stage}-${generation}-${text}`,
      autoHideMs: null,
      retry,
      retryLabel: 'Reintentar',
    });
  }

  /** Un único reintento por la vía existente; las guardas impiden duplicarlo. */
  private retryUpload(): void {
    if (this.isBusy()) return;
    if (this.grant && !this.needsRenewal()) void this.resumeUpload();
    else void this.startUpload();
  }

  retryToast(toast: UploadToast): void {
    // Se retira antes de actuar: un segundo clic ya no encuentra el botón.
    this.toastStore.dismiss(toast.id);
    toast.retry?.();
  }

  dismissToast(id: string): void { this.toastStore.dismiss(id); }
  pauseToast(id: string, source: ToastHold): void { this.toastStore.pause(id, source); }
  resumeToast(id: string, source: ToastHold): void { this.toastStore.resume(id, source); }

  private safeError(error: unknown): string {
    if (error instanceof UploadHttpError || error instanceof InvalidUploadResponseError ||
        error instanceof InvalidResumeUrlError) {
      return error.message;
    }
    return 'No se pudo completar la operación de vídeo. Vuelve a intentarlo.';
  }
}
