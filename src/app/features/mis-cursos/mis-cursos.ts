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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  LibraryCourse,
  LibraryProblem,
  MisCursosRepository,
} from './mis-cursos-repository';
import {
  CHECKOUT_MAX_ATTEMPTS,
  CHECKOUT_SCHEDULER,
  CheckoutReturn,
  CheckoutScheduler,
  CheckoutVerification,
  ORDER_UUID,
  checkoutDelayMs,
} from './mis-cursos-checkout';
import { MisCursosCheckoutRepository } from './mis-cursos-checkout-repository';

@Component({
  selector: 'app-mis-cursos',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mis-cursos.html',
  styleUrl: './mis-cursos.scss',
})
export class MisCursos {
  readonly auth = inject(AuthService);
  private readonly repository = inject(MisCursosRepository);
  private readonly checkoutRepository = inject(MisCursosCheckoutRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly scheduler = inject(CHECKOUT_SCHEDULER);
  readonly levels = { iniciacion: 'Iniciaci\u00f3n', basico: 'B\u00e1sico', intermedio: 'Intermedio' };

  /** Descarta respuestas de una identidad o recarga anteriores. */
  private request = 0;
  private destroyed = false;
  private loadedIdentity = '';

  readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  readonly courses = signal<LibraryCourse[]>([]);
  readonly unavailable = signal(0);
  readonly problems = signal<LibraryProblem[]>([]);
  readonly retrying = signal(false);

  /** Retorno del pago: null cuando la URL no pide comprobar nada. */
  readonly checkout = signal<CheckoutReturn | null>(null);
  /** El aviso solo se pinta con sesión: nada de la cuenta anterior tras logout. */
  readonly visibleCheckout = computed(() =>
    this.auth.status() === 'authenticated' ? this.checkout() : null);
  private checkoutKey = '';
  private checkoutIdentity = '';
  private checkoutRequest = 0;
  private checkoutTimer: unknown = null;
  /** Evita que la confirmación capture una biblioteca aún en carga. */
  private libraryDone: Promise<void> = Promise.resolve();

  /** Enlace del curso confirmado solo cuando la biblioteca ya lo ha cargado. */
  readonly confirmedCourse = computed(() => {
    const current = this.checkout();
    if (current?.kind !== 'confirmed') return null;
    return this.courses().find((course) => course.id === current.courseId) ?? null;
  });

  /** Fallos temporales concretos, sin contar los cursos inaccesibles. */
  /** Solo los fallos parciales se reintentan aislados; el error global recarga todo. */
  readonly failed = computed(() => (this.problems() ?? []).filter((problem) => problem.kind === 'failed'));

  /** Resumen global derivado de los cursos ya cargados; sin cifras inventadas. */
  readonly summary = computed(() => {
    const courses = this.courses();
    const total = courses.reduce((acc, course) => acc + course.total, 0);
    const completed = courses.reduce((acc, course) => acc + course.completed, 0);
    return {
      count: courses.length,
      total,
      completed,
      percent: total ? Math.round(completed * 100 / total) : 0,
    };
  });

  /** Usuario y estado de sesión; un token refrescado con el mismo id no recarga. */
  private readonly identity = computed(() => {
    const status = this.auth.status();
    if (status !== 'authenticated') return status;
    return `${status}:${this.auth.session()?.user.id ?? ''}`;
  });

  readonly userId = computed(() =>
    this.auth.status() === 'authenticated' ? this.auth.session()?.user.id ?? null : null);

  constructor() {
    this.identity(); // fija la identidad inicial antes de la primera carga
    effect(() => {
      const identity = this.identity();
      untracked(() => void this.load(identity));
    });
    // La query permanece en la URL (deep links): cambiarla reinicia la
    // comprobación y descarta respuestas y temporizadores anteriores.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const flag = params.get('checkout');
      const orderId = params.get('order_id');
      // `success` sin order_id también se atiende: respuesta honesta, sin BD.
      // `cancelled` es una señal explícita de la URL: aviso, sin verificación.
      const key = flag === 'success'
        ? `success:${orderId ?? ''}`
        : flag === 'cancelled' ? 'cancelled:' : '';
      if (key === this.checkoutKey) return;
      this.checkoutKey = key;
      if (flag === 'cancelled') {
        this.resetCheckout({ kind: 'cancelled' });
        return;
      }
      this.resetCheckout(key ? { kind: 'checking' } : null);
      if (key) untracked(() => void this.handleCheckout(this.identity()));
    });
    effect(() => {
      const identity = this.identity();
      untracked(() => void this.handleCheckout(identity));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
      this.checkoutRequest++;
      this.cancelCheckoutTimer();
      this.checkout.set(null);
    });
  }

  /**
   * Reintenta solo los cursos fallidos, conservando los validos ya cargados.
   * No entra en bucle: el boton vive en un aviso que desaparece al no quedar
   * fallos, y mientras hay una peticion en curso el estado es `loading`.
   */
  retry(): void {
    if (this.retrying() || !this.userId()) return;

    // Sin fallos parciales, el botón del error global fuerza una carga completa.
    if (!this.failed().length) {
      if (this.state() !== 'error') return;
      this.retrying.set(true);
      this.loadedIdentity = '';
      void this.load(this.identity()).finally(() => this.retrying.set(false));
      return;
    }

    this.retrying.set(true);
    const request = ++this.request;
    const previous = { courses: this.courses(), problems: this.problems() };
    void this.repository.load(this.userId()!, previous).then(
      (library) => {
        if (this.destroyed || request !== this.request) return;
        this.courses.set(library.courses);
        this.unavailable.set(library.unavailable);
        this.problems.set(library.problems);
        this.state.set(library.courses.length ? 'ready' : 'empty');
      },
      () => {
        if (this.destroyed || request !== this.request) return;
        // Reintento fallido: se conservan los cursos validos ya mostrados.
        this.state.set('ready');
      },
    ).finally(() => {
      if (request === this.request) this.retrying.set(false);
    });
  }

  /** Revisión iniciada por el alumno tras agotar los reintentos o ante un error. */
  recheckCheckout(): void {
    const userId = this.userId();
    const orderId = this.orderIdFromKey();
    if (!userId || !orderId) return;
    this.cancelCheckoutTimer();
    const request = ++this.checkoutRequest;
    this.checkout.set({ kind: 'checking' });
    void this.runCheckoutAttempt(userId, orderId, request, 0);
  }

  private async load(identity: string): Promise<void> {
    const userId = this.userId();
    if (!userId) {
      // Logout o sesión no usable: no queda datos de la identidad anterior,
      // aunque la plantilla ya no pinte la biblioteca.
      this.loadedIdentity = '';
      this.courses.set([]);
      this.problems.set([]);
      this.unavailable.set(0);
      this.retrying.set(false);
      this.state.set('empty');
      this.resetCheckout(null);
      return;
    }
    if (identity === this.loadedIdentity) return;

    this.loadedIdentity = identity;
    const request = ++this.request;
    let finish!: () => void;
    this.libraryDone = new Promise<void>((resolve) => { finish = resolve; });
    this.retrying.set(false);
    this.courses.set([]);
    this.problems.set([]);
    this.unavailable.set(0);
    this.state.set('loading');

    try {
      const library = await this.repository.load(userId);
      if (this.destroyed || request !== this.request) return;
      this.courses.set(library.courses);
      this.unavailable.set(library.unavailable);
      this.problems.set(library.problems);
      this.state.set(library.courses.length ? 'ready' : 'empty');
    } catch {
      if (this.destroyed || request !== this.request) return;
      this.courses.set([]);
      this.unavailable.set(0);
      this.problems.set([]);
      this.state.set('error');
    } finally {
      finish();
    }
  }

  private resetCheckout(state: CheckoutReturn | null): void {
    this.checkoutRequest++;
    this.cancelCheckoutTimer();
    this.checkoutIdentity = '';
    this.checkout.set(state);
  }

  private orderIdFromKey(): string | null {
    return this.checkoutKey.startsWith('success:')
      ? this.checkoutKey.slice('success:'.length)
      : null;
  }

  private async handleCheckout(identity: string): Promise<void> {
    if (!this.checkoutKey || this.checkoutKey.startsWith('cancelled:')
      || identity === 'loading' || identity === this.checkoutIdentity) return;
    this.checkoutIdentity = identity;
    this.cancelCheckoutTimer();
    const request = ++this.checkoutRequest;
    const userId = this.userId();
    const orderId = this.orderIdFromKey();
    if (!userId || !orderId || !ORDER_UUID.test(orderId)) {
      if (!this.destroyed && request === this.checkoutRequest) {
        this.checkout.set({ kind: 'notavailable' });
      }
      return;
    }
    this.checkout.set({ kind: 'checking' });
    await this.runCheckoutAttempt(userId, orderId, request, 0);
  }

  private async runCheckoutAttempt(
    userId: string,
    orderId: string,
    request: number,
    attempt: number,
  ): Promise<void> {
    if (this.destroyed || request !== this.checkoutRequest) return;
    let result: CheckoutVerification;
    try {
      result = await this.checkoutRepository.verify(orderId, userId);
    } catch {
      result = { kind: 'error' };
    }
    if (this.destroyed || request !== this.checkoutRequest) return;
    this.checkout.set(result);

    if (result.kind === 'confirmed') {
      void this.refreshLibrary(userId, result.courseId, request);
      return;
    }
    // Un fallo de red no se disfraza de "pendiente" y un pago pendiente no se
    // disfraza de confirmado. Solo se reintenta lo pendiente, con límite fijo.
    if (result.kind === 'pending' && attempt < CHECKOUT_MAX_ATTEMPTS - 1) {
      this.scheduleCheckoutRetry(userId, orderId, request, attempt + 1);
    }
  }

  private scheduleCheckoutRetry(
    userId: string,
    orderId: string,
    request: number,
    attempt: number,
  ): void {
    this.cancelCheckoutTimer();
    this.checkoutTimer = this.scheduler.schedule(() => {
      this.checkoutTimer = null;
      void this.runCheckoutAttempt(userId, orderId, request, attempt);
    }, checkoutDelayMs(attempt - 1));
  }

  private cancelCheckoutTimer(): void {
    if (this.checkoutTimer !== null) {
      this.scheduler.cancel(this.checkoutTimer);
      this.checkoutTimer = null;
    }
  }

  /** Tras confirmar, incorpora el curso a la biblioteca sin duplicados ni escrituras. */
  private async refreshLibrary(userId: string, courseId: string, checkoutRequest: number): Promise<void> {
    await this.libraryDone;
    // La espera puede coincidir con un cambio de cuenta o de query: nada de
    // una comprobación descartada debe tocar la biblioteca actual.
    if (this.destroyed || checkoutRequest !== this.checkoutRequest || this.userId() !== userId) return;
    const request = ++this.request;
    this.retrying.set(false);
    const retry = {
      courses: this.courses(),
      problems: this.problems(),
      includeCourseIds: [courseId],
    };
    void this.repository.load(userId, retry).then(
      (library) => {
        if (this.destroyed || request !== this.request) return;
        this.courses.set(library.courses);
        this.unavailable.set(library.unavailable);
        this.problems.set(library.problems);
        this.state.set(library.courses.length ? 'ready' : 'empty');
      },
      () => {
        // Si falla la recarga se conserva la biblioteca ya mostrada; el aviso
        // de confirmación sigue siendo el que aporta la BD.
      },
    );
  }
}
