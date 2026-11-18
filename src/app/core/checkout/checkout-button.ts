import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import { AuthService } from '../auth/auth.service';
import { safeLoginReturnUrl } from '../auth/return-url';
import {
  CHECKOUT_NAVIGATOR,
  CHECKOUT_TEST_BUTTON,
  CHECKOUT_TEST_NOTICE,
  checkoutErrorMessage,
} from './checkout';
import { CheckoutService } from './checkout.service';

/**
 * Único componente de compra. Con `mode="link"` lleva a la ficha con intención
 * de compra (catálogo); con `mode="buy"` muestra el aviso de prueba y, según el
 * acceso real ya calculado por la ficha, el login o el botón de pago.
 * Con el flag apagado no renderiza nada.
 */
@Component({
  selector: 'app-checkout-button',
  imports: [RouterLink],
  templateUrl: './checkout-button.html',
  styleUrl: './checkout-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutButton {
  private readonly config = inject(SUPABASE_CONFIG);
  private readonly auth = inject(AuthService);
  private readonly checkout = inject(CheckoutService);
  private readonly navigator = inject(CHECKOUT_NAVIGATOR);

  readonly mode = input<'buy' | 'link'>('buy');
  readonly courseId = input('');
  readonly courseSlug = input('');
  readonly accessState = input('');

  readonly notice = CHECKOUT_TEST_NOTICE;
  readonly buttonLabel = CHECKOUT_TEST_BUTTON;

  readonly enabled = computed(() => this.config.checkoutTestEnabled === true);
  readonly isLink = computed(() => this.mode() === 'link');
  readonly showLogin = computed(() => this.auth.status() !== 'authenticated' || this.accessState() === 'anonymous');
  readonly visible = computed(() => {
    if (!this.enabled()) return false;
    if (this.isLink()) return this.courseSlug().length > 0;
    return this.accessState() === 'anonymous' || this.accessState() === 'none';
  });
  readonly loginReturnUrl = computed(() =>
    safeLoginReturnUrl(`/cursos/${encodeURIComponent(this.courseSlug())}`) ?? '/cursos',
  );

  readonly starting = signal(false);
  readonly error = signal<string | null>(null);
  readonly retryable = signal(false);
  readonly needsLogin = signal(false);

  private generation = 0;
  private destroyed = false;
  private navigated = false;
  private lastIdentity = '';

  /** Cambia con sesión, cuenta, curso o acceso: invalida respuestas en vuelo. */
  readonly identityKey = computed(() =>
    `${this.auth.status()}:${this.auth.session()?.user.id ?? ''}:${this.courseId()}:${this.accessState()}`,
  );

  constructor() {
    this.lastIdentity = this.identityKey();

    effect(() => {
      const key = this.identityKey();
      untracked(() => {
        if (key === this.lastIdentity) return;
        this.lastIdentity = key;
        this.generation++;
        this.starting.set(false);
        this.error.set(null);
        this.retryable.set(false);
        this.needsLogin.set(false);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation++;
    });
  }

  /** Solo se llama desde un clic explícito; nunca desde un efecto ni al montar. */
  async buy(): Promise<void> {
    if (this.starting() || this.navigated || this.destroyed) return;

    const userId = this.auth.session()?.user.id;
    if (!userId) return;

    const courseId = this.courseId();
    const request = this.generation;
    this.starting.set(true);
    this.error.set(null);
    this.needsLogin.set(false);

    const result = await this.checkout.start(courseId, userId);

    if (this.destroyed || request !== this.generation) return;

    this.starting.set(false);
    if (result.kind === 'ok') {
      this.navigated = true;
      this.navigator.go(result.url);
      return;
    }

    this.error.set(checkoutErrorMessage(result.failure));
    this.retryable.set(result.failure.retryable);
    this.needsLogin.set(result.failure.code === 'login');
  }
}
