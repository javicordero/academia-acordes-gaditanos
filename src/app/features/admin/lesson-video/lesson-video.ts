import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type State = 'idle' | 'validando' | 'vinculado' | 'error' | 'sin-config' | 'sin-video';
type LinkResult = { linkage: 'linked' | 'linked_yet'; status: 'ready' | 'processing' };

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
})
export class LessonVideo {
  readonly lessonId = input('');
  readonly lessonTitle = input('');
  readonly courseId = input('');

  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly guidInput = viewChild<ElementRef<HTMLInputElement>>('guidInput');
  private generation = 0;

  readonly effectiveLessonId = computed(() =>
    this.lessonId() || this.route?.snapshot.paramMap.get('lessonId') || '',
  );
  readonly effectiveCourseId = computed(() =>
    this.courseId() || this.route?.snapshot.paramMap.get('courseId') || '',
  );
  readonly canEdit = computed(() => UUID.test(this.effectiveLessonId()));

  readonly state = signal<State>('idle');
  readonly message = signal('');
  readonly invalidGuid = signal(false);
  readonly formVisible = signal(false);
  readonly result = signal<LinkResult | null>(null);

  videoId = '';

  constructor() {
    this.destroy.onDestroy(() => this.generation++);
  }

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
}
