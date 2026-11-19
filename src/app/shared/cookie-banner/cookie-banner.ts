import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ConsentService } from '../../core/consent/consent.service';

/**
 * Aviso no modal: no fija el foco al entrar, no atrapa el tabulador y Escape no
 * lo cierra (así no se consentiría por accidente). Solo se renderiza mientras
 * hay una decisión pendiente o se están editando preferencias; una vez guardado
 * no deja ninguna barra persistente. Para cambiar la elección se abre de nuevo
 * desde el botón de `/legal/cookies` mediante `ConsentService.openPreferences()`,
 * que no altera la persistencia ni las categorías.
 */
@Component({
  selector: 'app-cookie-banner',
  templateUrl: './cookie-banner.html',
  styleUrl: './cookie-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.cookie-banner--in-classroom]': 'classroom()',
    '[class.cookie-banner--hidden]': '!consent.bannerVisible()',
  },
})
export class CookieBanner {
  /** En el aula la barra va en flujo: no tapa los controles del reproductor. */
  readonly classroom = input(false);

  protected readonly consent = inject(ConsentService);

  protected onAnalyticsToggle(event: Event): void {
    this.consent.setDraftAnalytics((event.target as HTMLInputElement).checked);
  }
}
