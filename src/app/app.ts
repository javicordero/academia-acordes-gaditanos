import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';

import { AuthService } from './core/auth/auth.service';
import { SiteFooter } from './shared/site-footer/site-footer';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, SiteFooter],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly logoutError = signal<string | null>(null);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

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
