import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { THEME_OPTIONS, ThemeId, ThemeService } from '../../core/theme/theme.service';

/**
 * Selector de temas listo para colocar en `.site-header__tools`. No se integra
 * todavía en app.html: la integración futura la coordina quien revise menú,
 * cookies y foro. El click no burbujea para no cerrar el menú móvil.
 */
@Component({
  selector: 'app-theme-selector',
  templateUrl: './theme-selector.html',
  styleUrl: './theme-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSelector {
  protected readonly theme = inject(ThemeService);
  protected readonly options = THEME_OPTIONS;
  protected readonly open = signal(false);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected close(restoreFocus = false): void {
    this.open.set(false);
    if (restoreFocus) {
      this.trigger()?.nativeElement.focus();
    }
  }

  protected select(id: ThemeId): void {
    this.theme.setTheme(id);
    this.close(true);
  }

  /** Enter/space en una opción: se activa sin duplicar el click del navegador. */
  protected onOptionKeydown(event: KeyboardEvent, id: ThemeId): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(id);
    }
  }

  /** Escape cierra el desplegable y devuelve el foco al botón que lo abrió. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.open()) {
      return;
    }
    event.preventDefault();
    this.close(true);
  }

  /** Evita que el disclosure móvil interprete estos clicks como cierre. */
  protected stopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
