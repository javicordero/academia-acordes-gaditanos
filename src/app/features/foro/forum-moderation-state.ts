import { Injectable, signal } from '@angular/core';

/**
 * Memoria de sesión de la moderación del foro. Solo guarda identificadores de
 * hilos que la RPC ya confirmó como borrados: ningún dato personal ni contenido.
 * La autoridad sigue siendo el servidor; esto únicamente evita que la lista de
 * hilos muestre un tema eliminado hasta que se recargue la página.
 */
@Injectable({ providedIn: 'root' })
export class ForumModerationState {
  private readonly _deletedThreadIds = signal<ReadonlySet<string>>(new Set<string>());

  readonly deletedThreadIds = this._deletedThreadIds.asReadonly();

  markThreadDeleted(threadId: string): void {
    this._deletedThreadIds.update((ids) => new Set([...ids, threadId]));
  }
}
