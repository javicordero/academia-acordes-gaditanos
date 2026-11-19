import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { AuthService } from '../../../core/auth/auth.service';
import { CheckoutButton } from '../../../core/checkout/checkout-button';
import { SkeletonBlock } from '../../../shared/skeleton/skeleton';
import {
  CourseAccess,
  CourseDetail as Detail,
  PublicCoursesRepository,
  levelLabels,
} from '../public-courses-repository';

type AccessState =
  | 'session-loading'
  | 'unconfigured'
  | 'anonymous'
  | 'idle'
  | 'checking'
  | 'granted'
  | 'revoked'
  | 'none'
  | 'error';

interface AccessAnswer {
  readonly courseId: string;
  readonly userId: string;
  readonly access: CourseAccess;
}

@Component({
  selector: 'app-course-detail',
  imports: [RouterLink, NgTemplateOutlet, CheckoutButton, SkeletonBlock],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseDetail {
  private readonly repository = inject(PublicCoursesRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly config = inject(SUPABASE_CONFIG);
  readonly auth = inject(AuthService);

  /** Solo controla la UI; la compra real depende siempre del servidor. */
  readonly checkoutEnabled = computed(() => this.config.checkoutTestEnabled === true);

  readonly detail = signal<Detail | null>(null);
  readonly state = signal<'loading' | 'ready' | 'missing' | 'unavailable' | 'error'>('loading');
  readonly levels = levelLabels;

  /** Derecho consultado para la identidad y ficha actuales. */
  readonly accessAnswer = signal<AccessAnswer | null>(null);
  /** Fallo de la consulta de derecho actual: nunca se confunde con «sin acceso». */
  readonly accessError = signal<{ courseId: string; userId: string } | null>(null);
  readonly checkingAccess = signal(false);

  private request = 0;
  private accessRequest = 0;
  private destroyed = false;
  /** Evita repetir la consulta del mismo usuario y ficha al reintentar la ficha. */
  private lastAccessKey = '';

  readonly status = computed(() => this.auth.status());
  readonly session = computed(() => this.auth.session());

  readonly currentUserId = computed(() => {
    if (this.status() !== 'authenticated') return null;
    return this.session()?.user.id ?? null;
  });

  /** Identidad estable: un TOKEN_REFRESHED con el mismo usuario no la cambia. */
  readonly identityKey = computed(() => `${this.status()}-${this.currentUserId() ?? ''}`);

  readonly accessState = computed<AccessState>(() => {
    const data = this.detail();
    const status = this.status();
    // Sin identidad confirmada no se muestra un estado anónimo falso ni se
    // consulta ningún derecho privado (syncAccess recibe un userId nulo).
    if (status === 'loading') return 'session-loading';
    if (status === 'unconfigured') return 'unconfigured';
    const userId = this.currentUserId();
    if (!userId) return 'anonymous';
    if (!data) return this.accessError() ? 'error' : 'idle';
    const answer = this.accessAnswer();
    if (answer && answer.userId === userId && answer.courseId === data.course.id) return answer.access;
    const failed = this.accessError();
    if (failed && failed.userId === userId && failed.courseId === data.course.id) return 'error';
    return this.checkingAccess() ? 'checking' : 'idle';
  });

  /** Primer destino accesible de la ficha; `null` si no hay lecciones. */
  readonly firstDestination = computed(() => {
    const data = this.detail();
    const lesson = data?.lessons[0];
    if (!data || !lesson) return null;
    return { courseSlug: data.course.slug, lessonSlug: lesson.slug };
  });

  /** Muestras gratuitas explícitas de la ficha. */
  readonly previewLessons = computed(() =>
    this.detail()?.lessons.filter((lesson) => lesson.is_free_preview) ?? []);

  /** Botón único de acceso: abre el aula solo si hay una lección accesible. */
  readonly destination = computed(() => this.accessState() === 'granted' ? this.firstDestination() : null);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /**
   * Sólo un marcador de retorno. La query no concede acceso, no confirma pagos
   * y no dispara ninguna escritura: la ficha sigue consultando el derecho real.
   */
  readonly returnedFromCheckout = computed(() => this.query().get('checkout') === 'cancelled');

  constructor() {
    void this.load();

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
      this.accessRequest++;
    });

    effect(() => {
      const identity = this.identityKey();
      const data = this.detail();
      const userId = this.currentUserId();
      untracked(() => this.syncAccess(identity, data, userId));
    });
  }

  async load(slug = this.params().get('slug') ?? ''): Promise<void> {
    const request = ++this.request;
    this.state.set('loading');
    this.detail.set(null);
    try {
      const detail = await this.repository.detail(slug);
      if (this.destroyed || request !== this.request) return;
      this.detail.set(detail);
      this.state.set(detail ? 'ready' : 'missing');
    } catch (error) {
      if (this.destroyed || request !== this.request) return;
      this.state.set(error instanceof Error && error.message === 'unavailable' ? 'unavailable' : 'error');
    }
  }

  /**
   * Consulta el derecho solo con sesión iniciada y ficha publicada. Las
   * respuestas de otra identidad o de otra ficha se descartan por contador y por
   * comparación de usuario/curso; nunca se reutiliza el acceso de otra cuenta.
   * Sin sesión no se hace ninguna petición a `entitlements`.
   */
  private async syncAccess(identity: string, data: Detail | null, userId: string | null): Promise<void> {
    if (!userId) {
      this.clearAccess();
      return;
    }
    if (!data) return;
    const courseId = data.course.id;
    const key = `${identity}-${courseId}`;
    if (key === this.lastAccessKey) return;
    this.lastAccessKey = key;

    const request = ++this.accessRequest;
    this.accessAnswer.set(null);
    this.accessError.set(null);
    this.checkingAccess.set(true);
    try {
      const access = await this.repository.access(courseId, userId);
      if (!this.current(request, identity)) return;
      this.accessAnswer.set({ courseId, userId, access });
    } catch {
      if (!this.current(request, identity)) return;
      this.accessError.set({ courseId, userId });
    } finally {
      if (this.current(request, identity)) this.checkingAccess.set(false);
    }
  }

  private current(request: number, identity: string): boolean {
    return !this.destroyed && request === this.accessRequest && identity === this.identityKey();
  }

  private clearAccess(): void {
    this.accessRequest++;
    this.accessAnswer.set(null);
    this.accessError.set(null);
    this.checkingAccess.set(false);
    this.lastAccessKey = '';
  }

  /** Reintento solo de la consulta de derecho; conserva la ficha ya cargada. */
  retryAccess(): void {
    const data = this.detail();
    const userId = this.currentUserId();
    if (!data || !userId) return;
    this.clearAccess();
    untracked(() => void this.syncAccess(this.identityKey(), data, userId));
  }
}
