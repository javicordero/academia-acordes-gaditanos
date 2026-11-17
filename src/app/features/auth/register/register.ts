import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './register.html',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmationSent = signal(false);
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
    const result = await this.auth.register(email, password);

    this.submitting.set(false);

    if (!result.ok) {
      this.error.set(
        result.message ?? 'No se pudo crear la cuenta. Inténtalo de nuevo.',
      );
      return;
    }

    if (result.needsEmailConfirmation) {
      this.confirmationSent.set(true);
      return;
    }

    await this.router.navigateByUrl('/mis-cursos');
  }
}
