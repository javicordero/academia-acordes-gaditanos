import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
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

    const { email } = this.form.getRawValue();
    const result = await this.auth.requestPasswordReset(email);

    this.submitting.set(false);

    if (!result.ok) {
      this.error.set(
        result.message ??
          'No se pudo procesar la solicitud. Inténtalo de nuevo más tarde.',
      );
      return;
    }

    this.success.set(
      result.message ??
        'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.',
    );
  }
}
