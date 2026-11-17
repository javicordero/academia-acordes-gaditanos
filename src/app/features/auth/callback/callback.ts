import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EmailOtpType } from '@supabase/supabase-js';

import { AuthResult, AuthService } from '../../../core/auth/auth.service';
import { sanitizeReturnUrl } from '../../../core/auth/return-url';

const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const;

@Component({
  selector: 'app-auth-callback',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './callback.html',
})
export class AuthCallback implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<'loading' | 'error'>('loading');
  readonly message = signal('Comprobando el enlace de acceso…');

  async ngOnInit(): Promise<void> {
    const query = this.route.snapshot.queryParamMap;

    if (query.has('error') || query.has('error_code')) {
      await this.fail();
      return;
    }

    const tokenHash = query.get('token_hash');
    let result: AuthResult;

    if (tokenHash) {
      const rawType = query.get('type');
      const type: EmailOtpType = EMAIL_OTP_TYPES.find(
        (candidate) => candidate === rawType,
      ) ?? 'email';
      result = await this.auth.completeEmailOtpLink(tokenHash, type);
    } else {
      const code = query.get('code');

      if (!code) {
        await this.fail();
        return;
      }

      result = await this.auth.completeEmailLink(code);
    }

    if (!result.ok) {
      await this.fail(
        result.message ??
          'El enlace no es válido o ha caducado. Solicita uno nuevo.',
      );
      return;
    }

    const next =
      sanitizeReturnUrl(query.get('next')) ?? '/auth/cuenta-confirmada';

    await this.router.navigateByUrl(next, { replaceUrl: true });
  }

  private async fail(
    message = 'El enlace no es válido o ha caducado. Solicita uno nuevo.',
  ): Promise<void> {
    this.state.set('error');
    this.message.set(message);

    // Elimina el código y cualquier parámetro del enlace de la barra de
    // direcciones sin recargar la aplicación.
    await this.router.navigate(['/auth/callback'], {
      replaceUrl: true,
      queryParams: {},
    });
  }
}
