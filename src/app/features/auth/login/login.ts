import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { safeLoginReturnUrl } from '../../../core/auth/return-url';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(
    this.route.snapshot.queryParamMap.get('passwordUpdated') === '1'
      ? 'Contraseña actualizada. Inicia sesión de nuevo.'
      : null,
  );
  readonly configurationPending = this.auth.configurationPending;

  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    const emailControl = this.form.controls.email;
    emailControl.setValue(emailControl.value.trim(), { emitEvent: false });
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();
    const result = await this.auth.login(email, password);

    this.submitting.set(false);

    if (!result.ok) {
      this.error.set(
        result.message ?? 'No se pudo iniciar sesión. Inténtalo de nuevo.',
      );
      return;
    }

    const returnUrl = safeLoginReturnUrl(
      this.route.snapshot.queryParamMap.get('returnUrl'),
    );

    await this.router.navigateByUrl(returnUrl ?? '/mis-cursos');
  }
}
