import { InjectionToken } from '@angular/core';

/** Mismo formato de UUID que valida el servidor al reservar el pedido. */
export const ORDER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cuatro intentos como máximo: nunca un bucle abierto. */
export const CHECKOUT_MAX_ATTEMPTS = 4;
export const checkoutDelayMs = (attempt: number): number => 1500 * 2 ** attempt;

/** Resultado autoritativo de la comprobación del retorno de Stripe. */
export type CheckoutVerification =
  | { readonly kind: 'confirmed'; readonly courseId: string }
  | { readonly kind: 'pending' }
  | { readonly kind: 'notavailable' }
  | { readonly kind: 'error' };

/** Estado visible; `checking` solo existe mientras se consulta la BD. */
export type CheckoutReturn = { readonly kind: 'checking' } | CheckoutVerification;

/** Temporizadores inyectables para poder cancelarlos y probarlos sin reloj falso. */
export interface CheckoutScheduler {
  schedule(task: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export const CHECKOUT_SCHEDULER = new InjectionToken<CheckoutScheduler>(
  'CHECKOUT_SCHEDULER',
  {
    providedIn: 'root',
    factory: () => ({
      schedule: (task, delayMs) => setTimeout(task, delayMs),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    }),
  },
);
