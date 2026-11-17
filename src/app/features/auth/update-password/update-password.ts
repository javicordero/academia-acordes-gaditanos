import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-update-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './update-password.html',
})
export class UpdatePassword {
  private readonly auth = inject(AuthService);

  readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', Validators.required],
    confirmPassword: ['', Validators.required],
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly updated = signal(false);
  readonly logoutConfirmed = signal(false);
  readonly configurationPending = this.auth.configurationPending;

  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }

    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const { password, confirmPassword } = this.form.getRawValue();

    if (password !== confirmPassword) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    const result = await this.auth.updatePassword(password);

    if (!result.ok) {
      this.submitting.set(false);
      this.error.set(
        result.message ??
          'No se pudo actualizar la contraseña. Solicita un enlace nuevo.',
      );
      return;
    }

    // Tras cambiar la contraseña se intenta cerrar la sesión. El servicio no
    // borra la sesión local si el cierre falla, así que el mensaje no puede
    // afirmar que hace falta volver a entrar.
    const logoutResult = await this.auth.logout();
    this.submitting.set(false);
    this.updated.set(true);
    this.logoutConfirmed.set(logoutResult.ok);
  }
}
