import { InjectionToken, Injectable, signal } from '@angular/core';

/**
 * Avisos de la subida de vídeo: dedupe, autocierre y pausa del autocierre.
 * Sin dependencias nuevas: signals + temporizadores del navegador.
 */

/** Duración de los avisos informativos y de éxito (los errores no se cierran solos). */
export const UPLOAD_TOAST_TIMING = new InjectionToken<UploadToastTiming>('UPLOAD_TOAST_TIMING', {
  providedIn: 'root',
  factory: () => ({ infoMs: 4000, successMs: 6000 }),
});

export interface UploadToastTiming {
  readonly infoMs: number;
  readonly successMs: number;
}

export type UploadToastSeverity = 'info' | 'success' | 'error';

export interface UploadToast {
  readonly id: string;
  readonly severity: UploadToastSeverity;
  /** Etiqueta visible: el tono nunca es el único indicador de gravedad. */
  readonly title: string;
  readonly text: string;
  /** Un mismo motivo no se anuncia dos veces mientras siga visible. */
  readonly dedupeKey: string;
  /** `null` = persistente (aviso con acción); requiere cierre manual. */
  readonly autoHideMs: number | null;
  readonly retry?: () => void;
  readonly retryLabel?: string;
}

export type NewUploadToast = Omit<UploadToast, 'id'>;

/** Motivo por el que se detiene el autocierre; se controlan por separado. */
export type ToastHold = 'hover' | 'focus';

/** Tope de claves recordadas: evita crecer sin límite en sesiones largas. */
const MAX_ANNOUNCED = 128;

/** Tope de avisos simultáneos para evitar acumulaciones ruidosas. */
const MAX_TOASTS = 4;

/**
 * Almacén de avisos con ámbito de componente (no `providedIn: 'root'`): nace y
 * muere con `LessonVideo`, así que no comparte estado con otras pantallas del
 * panel ni deja avisos huérfanos al cambiar de lección o cerrar sesión.
 *
 * El componente solo describe qué ocurrió; aquí se concentran el dedupe por
 * motivo, el autocierre de los avisos sin acción y la pausa al pasar el puntero
 * o el foco. Los avisos son objetos estables: la vista los renderiza con `track
 * id` y no se recrean en cada cambio.
 *
 * El dedupe sobrevive al autocierre (`announced`): un hito o «Listo» no se
 * vuelve a anunciar aunque el aviso ya haya desaparecido de la pantalla. Las
 * claves incluyen la generación de subida, así que una generación nueva sí
 * puede volver a anunciar sus propios hitos.
 */
@Injectable()
export class UploadToasts {
  private sequence = 0;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly deadlines = new Map<string, { remaining: number; startedAt: number }>();
  private readonly holds = new Map<string, Set<ToastHold>>();
  private readonly announced = new Set<string>();
  private readonly items = signal<UploadToast[]>([]);

  readonly toasts = this.items.asReadonly();

  push(toast: NewUploadToast): void {
    if (this.announced.has(toast.dedupeKey) ||
        this.items().some((current) => current.dedupeKey === toast.dedupeKey)) return;

    let list = this.items();
    if (list.length >= MAX_TOASTS) {
      // Se conservan primero los errores persistentes: se descarta un aviso temporal.
      const droppable = list.find((current) => current.autoHideMs !== null) ?? list[0];
      if (droppable) {
        this.clearTimer(droppable.id);
        list = list.filter((current) => current.id !== droppable.id);
      }
    }

    const created: UploadToast = { ...toast, id: `subida-aviso-${++this.sequence}` };
    this.items.set([...list, created]);
    this.remember(created.dedupeKey);
    if (created.autoHideMs !== null) this.arm(created.id, created.autoHideMs);
  }

  dismiss(id: string): void {
    this.clearTimer(id);
    this.items.update((list) => list.filter((toast) => toast.id !== id));
  }

  /** Descarta todos los avisos: cambio de archivo o lección, logout o destrucción. */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.deadlines.clear();
    this.holds.clear();
    this.items.set([]);
    // `announced` NO se limpia: tras el autocierre no se reanuncia el mismo motivo.
  }

  /** Número de autocierres pendientes (para comprobar la limpieza de timers). */
  getTimerCount(): number {
    return this.timers.size;
  }

  /** Detiene el autocierre mientras el puntero o el foco estén sobre el aviso. */
  pause(id: string, source: ToastHold): void {
    let active = this.holds.get(id);
    if (!active) {
      active = new Set<ToastHold>();
      this.holds.set(id, active);
    }
    active.add(source);
    const deadline = this.deadlines.get(id);
    const timer = this.timers.get(id);
    if (!deadline || timer === undefined) return;
    clearTimeout(timer);
    this.timers.delete(id);
    deadline.remaining = Math.max(0, deadline.remaining - (Date.now() - deadline.startedAt));
  }

  /** Solo reanuda cuando NI el puntero NI el foco siguen sobre el aviso. */
  resume(id: string, source: ToastHold): void {
    const active = this.holds.get(id);
    active?.delete(source);
    if (active?.size) return;
    this.holds.delete(id);
    const deadline = this.deadlines.get(id);
    if (!deadline || this.timers.has(id)) return;
    const toast = this.items().find((current) => current.id === id);
    if (!toast || toast.autoHideMs === null) return;
    this.arm(id, deadline.remaining);
  }

  private arm(id: string, ms: number): void {
    const previous = this.timers.get(id);
    if (previous !== undefined) clearTimeout(previous);
    this.deadlines.set(id, { remaining: ms, startedAt: Date.now() });
    this.timers.set(id, setTimeout(() => this.dismiss(id), ms));
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(id);
    this.deadlines.delete(id);
    this.holds.delete(id);
  }

  private remember(key: string): void {
    if (this.announced.has(key)) return;
    this.announced.add(key);
    if (this.announced.size > MAX_ANNOUNCED) {
      const oldest = this.announced.values().next().value;
      if (oldest !== undefined) this.announced.delete(oldest);
    }
  }
}
