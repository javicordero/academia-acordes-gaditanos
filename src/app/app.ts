import { DOCUMENT } from '@angular/common';
import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, skip } from 'rxjs';

import { AnalyticsService } from './core/analytics/analytics.service';
import { AuthService } from './core/auth/auth.service';
import { CookieBanner } from './shared/cookie-banner/cookie-banner';
import { SiteFooter } from './shared/site-footer/site-footer';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, CookieBanner, SiteFooter],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  /** Se instancia al arrancar para escuchar NavigationEnd tras el consentimiento. */
  private readonly analytics = inject(AnalyticsService);
  readonly logoutError = signal<string | null>(null);

  /** Un único stream de navegaciones para la URL y el foco, sin duplicar filtros. */
  private readonly navigationEnd$ = this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
  );

  private readonly currentUrl = toSignal(
    this.navigationEnd$.pipe(map((event) => event.urlAfterRedirects)),
    { initialValue: this.router.url },
  );

  constructor() {
    // La primera navegación es la carga inicial: no le robamos el foco al usuario.
    // En navegaciones posteriores llevamos el foco al contenido principal.
    this.navigationEnd$
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => {
        this.document.getElementById('contenido-principal')?.focus();
      });
  }

  /**
   * El aula pública y la vista previa de administración comparten el layout a
   * pantalla completa (`app-classroom-nav` + la hoja del aula). Ambas ocultan la
   * cabecera global para dar la misma experiencia; la detección sale de Router,
   * nunca de `window.location`.
   */
  readonly isClassroom = computed(() => {
    const url = this.currentUrl();
    return url.includes('/aula/') || url.includes('/vista-previa');
  });

  async logout(): Promise<void> {
    this.logoutError.set(null);
    const result = await this.auth.logout();

    if (!result.ok) {
      this.logoutError.set(
        result.message ?? 'No se pudo cerrar la sesión. Inténtalo de nuevo.',
      );
      return;
    }

    await this.router.navigateByUrl('/cursos');
  }
}
