import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
