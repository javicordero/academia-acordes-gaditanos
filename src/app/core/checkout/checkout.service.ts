import { Injectable, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../supabase/supabase-client';
import {
  CheckoutStartResult,
  canonicalAttemptId,
  classifyCheckoutError,
  isCheckoutUuid,
  isSafeCheckoutUrl,
} from './checkout';

/**
 * Inicia la compra TEST usando la sesión que ya gestiona el SDK de Supabase.
 * No se extrae el JWT, no se guardan secretos y no se consulta ningún pedido
 * desde el cliente: la respuesta del servidor solo aporta una URL validada.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly client = inject(SUPABASE_CLIENT);
  /** Dedupe de llamadas concurrentes para la misma acción. */
  private readonly inflight = new Map<string, Promise<CheckoutStartResult>>();

  start(courseId: string, userId: string): Promise<CheckoutStartResult> {
    const key = `${userId}:${courseId}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const task = this.invoke(courseId, userId).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, task);
    return task;
  }

  private async invoke(courseId: string, userId: string): Promise<CheckoutStartResult> {
    if (!this.client || !isCheckoutUuid(courseId) || !isCheckoutUuid(userId)) {
      return { kind: 'failure', failure: { code: 'unavailable', retryable: false } };
    }

    const attemptId = canonicalAttemptId(userId, courseId);

    try {
      const { data, error } = await this.client.functions.invoke('create-checkout', {
        body: { courseId, attemptId },
      });

      if (error) {
        return { kind: 'failure', failure: classifyCheckoutError(error) };
      }

      const url = (data as { url?: unknown } | null)?.url;
      if (!isSafeCheckoutUrl(url)) {
        return { kind: 'failure', failure: { code: 'unknown', retryable: true } };
      }

      return { kind: 'ok', url };
    } catch (error) {
      return { kind: 'failure', failure: classifyCheckoutError(error) };
    }
  }
}
