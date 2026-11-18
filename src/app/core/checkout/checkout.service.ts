import { DOCUMENT, Injectable, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../supabase/supabase-client';
import {
  CheckoutStartResult,
  canonicalAttemptId,
  checkoutOwnerHash,
  classifyCheckoutError,
  isCheckoutSessionId,
  isCheckoutUuid,
  isSafeCheckoutUrl,
} from './checkout';

/** La clave antigua sin dueño se ignora y se borra; nunca se reenvía. */
const legacyKey = (courseId: string) => `academia.checkout.recovery.${courseId}`;
const recoveryKey = (courseId: string, ownerHash: string) => `${legacyKey(courseId)}.${ownerHash}`;

type Recovery = { ownerHash: string; attemptId: string; sessionId: string };
const STALE: CheckoutStartResult = {
  kind: 'failure', failure: { code: 'unavailable', retryable: false },
};

/**
 * Inicia la compra TEST usando la sesión que ya gestiona el SDK de Supabase.
 * No se extrae el JWT, no se guardan secretos ni el id de usuario: la marca
 * opaca intento/sesión se aísla por resumen local de la cuenta actual.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly document = inject(DOCUMENT);
  /** Dedupe de llamadas concurrentes para la misma acción. */
  private readonly inflight = new Map<string, Promise<CheckoutStartResult>>();
  /** Toda salida de cuenta o destrucción invalida respuestas en vuelo. */
  private epoch = 0;

  start(courseId: string, userId: string): Promise<CheckoutStartResult> {
    const key = `${userId}:${courseId}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const task = this.invoke(courseId, userId).finally(() => {
      if (this.inflight.get(key) === task) this.inflight.delete(key);
    });
    this.inflight.set(key, task);
    return task;
  }

  /** Invalida peticiones en vuelo sin borrar la marca legítima de la cuenta. */
  cancelPending(courseId: string, userId: string): void {
    this.epoch++;
    this.inflight.delete(`${userId}:${courseId}`);
  }

  /** Descarta la marca de la cuenta/curso que se está abandonando. */
  async discardRecovery(courseId: string, userId: string): Promise<void> {
    this.cancelPending(courseId, userId);
    const ownerHash = await checkoutOwnerHash(userId);
    if (!ownerHash) return;
    try { this.storage()?.removeItem(legacyKey(courseId)); } catch { /* almacenamiento opcional */ }
    try { this.storage()?.removeItem(recoveryKey(courseId, ownerHash)); } catch { /* almacenamiento opcional */ }
  }

  private async invoke(courseId: string, userId: string): Promise<CheckoutStartResult> {
    if (!this.client || !isCheckoutUuid(courseId) || !isCheckoutUuid(userId)) {
      return { kind: 'failure', failure: { code: 'unavailable', retryable: false } };
    }

    const started = this.epoch;
    const ownerHash = await checkoutOwnerHash(userId);
    if (started !== this.epoch) return STALE;

    const recovery = ownerHash ? this.readRecovery(courseId, ownerHash) : null;
    const attemptId = recovery?.attemptId ?? canonicalAttemptId(userId, courseId);
    const body = recovery
      ? { courseId, attemptId, sessionId: recovery.sessionId }
      : { courseId, attemptId };

    try {
      const { data, error } = await this.client.functions.invoke('create-checkout', { body });
      if (started !== this.epoch) return STALE;
      if (error) {
        return { kind: 'failure', failure: classifyCheckoutError(error) };
      }

      const url = (data as { url?: unknown } | null)?.url;
      if (!isSafeCheckoutUrl(url)) {
        return { kind: 'failure', failure: { code: 'unknown', retryable: true } };
      }

      const response = data as { sessionId?: unknown; attemptId?: unknown } | null;
      const sessionId = isCheckoutSessionId(response?.sessionId) ? response.sessionId : null;
      const returnedAttempt = isCheckoutUuid(response?.attemptId) ? response.attemptId : null;
      const usedAttempt = returnedAttempt ?? attemptId;
      if (sessionId && ownerHash && started === this.epoch) {
        this.saveRecovery(courseId, ownerHash, { ownerHash, attemptId: usedAttempt, sessionId });
      }
      return {
        kind: 'ok',
        url,
        ...(sessionId ? { sessionId } : {}),
        ...(returnedAttempt ? { attemptId: returnedAttempt } : {}),
      };
    } catch (error) {
      return started === this.epoch
        ? { kind: 'failure', failure: classifyCheckoutError(error) }
        : STALE;
    }
  }

  private storage(): Storage | null {
    try { return this.document.defaultView?.localStorage ?? null; } catch { return null; }
  }

  private readRecovery(courseId: string, ownerHash: string): Recovery | null {
    // Registro antiguo sin dueño: se elimina, nunca se interpreta ni se envía.
    this.remove(legacyKey(courseId));
    try {
      const raw = this.storage()?.getItem(recoveryKey(courseId, ownerHash));
      if (raw === null || raw === undefined) return null;
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object') return this.drop(courseId, ownerHash);
      const candidate = value as Partial<Recovery>;
      if (candidate.ownerHash !== ownerHash ||
          !isCheckoutUuid(candidate.attemptId) ||
          !isCheckoutSessionId(candidate.sessionId)) {
        return this.drop(courseId, ownerHash);
      }
      return {
        ownerHash, attemptId: candidate.attemptId, sessionId: candidate.sessionId,
      };
    } catch {
      return this.drop(courseId, ownerHash);
    }
  }

  private drop(courseId: string, ownerHash: string): null {
    this.remove(recoveryKey(courseId, ownerHash));
    return null;
  }

  private remove(key: string): void {
    try { this.storage()?.removeItem(key); } catch { /* almacenamiento opcional */ }
  }

  private saveRecovery(courseId: string, ownerHash: string, recovery: Recovery): void {
    try {
      this.storage()?.setItem(recoveryKey(courseId, ownerHash), JSON.stringify(recovery));
    } catch { /* almacenamiento opcional */ }
  }
}
