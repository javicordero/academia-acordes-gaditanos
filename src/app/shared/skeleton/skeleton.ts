import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { SkeletonVariant } from './skeleton.models';

const MIN_LINES = 1;
const MAX_LINES = 8;
const DEFAULT_LINES = 3;

/**
 * Esqueleto presentacional para estados de carga. No consulta datos, no guarda
 * estado y no interactúa: se coloca dentro de `@if (loading())` en cada página.
 * Las formas son decorativas (`aria-hidden`) y un único aviso sr-only anuncia
 * la carga a lectores de pantalla.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skeleton.html',
  styleUrl: './skeleton.scss',
})
export class SkeletonBlock {
  readonly variant = input<SkeletonVariant>('text');
  /** Solo aplica a la variante `text`; se acota para no crear DOM ilimitado. */
  readonly lines = input(DEFAULT_LINES);
  readonly ariaLabel = input('Cargando contenido…');
  /** Rejillas públicas; una tarjeta por defecto conserva los usos individuales. */
  readonly count = input(1);
  readonly cardIndices = computed(() => {
    const count = this.count();
    return Array.from({ length: Number.isFinite(count) ? Math.min(6, Math.max(1, Math.trunc(count))) : 1 }, (_, i) => i);
  });

  readonly lineIndices = computed(() => {
    const requested = this.lines();
    const safe = Number.isFinite(requested) ? Math.trunc(requested) : DEFAULT_LINES;
    const count = Math.min(MAX_LINES, Math.max(MIN_LINES, safe));
    return Array.from({ length: count }, (_, index) => index);
  });

  readonly rowIndices = [0, 1, 2, 3, 4] as const;
  readonly indexIndices = [0, 1, 2, 3, 4, 5] as const;
}
