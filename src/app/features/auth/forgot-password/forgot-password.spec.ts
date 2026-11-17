import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../../core/auth/auth.service';
import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  function setup() {
    const requestPasswordReset = vi.fn();

    TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [
        {
          provide: AuthService,
          useValue: {
            requestPasswordReset,
            configurationPending: signal(false),
          },
        },
      ],
    });

    return {
      component: TestBed.createComponent(ForgotPassword).componentInstance,
      requestPasswordReset,
    };
  }

  it('muestra siempre una respuesta genérica de recuperación', async () => {
    const { component, requestPasswordReset } = setup();
    requestPasswordReset.mockResolvedValue({
      ok: true,
      message: 'Si existe una cuenta con ese correo, recibirás un enlace.',
    });
    component.form.setValue({ email: 'alumno@example.test' });

    await component.submit();

    expect(requestPasswordReset).toHaveBeenCalledWith('alumno@example.test');
    expect(component.success()).toContain('Si existe una cuenta');
    expect(component.error()).toBeNull();
  });

  it('muestra el límite de envío sin revelar cuentas', async () => {
    const { component, requestPasswordReset } = setup();
    requestPasswordReset.mockResolvedValue({
      ok: false,
      message: 'Demasiados intentos. Espera unos minutos.',
    });
    component.form.setValue({ email: 'alumno@example.test' });

    await component.submit();

    expect(component.error()).toContain('Demasiados intentos');
    expect(component.success()).toBeNull();
  });
});
