import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { Register } from './register';

describe('Register', () => {
  function setup() {
    const register = vi.fn();
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        {
          provide: AuthService,
          useValue: { register, configurationPending: signal(false) },
        },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });

    return {
      component: TestBed.createComponent(Register).componentInstance,
      register,
      navigateByUrl,
    };
  }

  it('muestra el mensaje de confirmación cuando no hay sesión todavía', async () => {
    const { component, register } = setup();
    register.mockResolvedValue({ ok: true, needsEmailConfirmation: true });
    component.form.setValue({ email: 'alumno@example.test', password: 'clave' });

    await component.submit();

    expect(component.confirmationSent()).toBe(true);
    expect(component.error()).toBeNull();
  });

  it('muestra los errores de registro', async () => {
    const { component, register, navigateByUrl } = setup();
    register.mockResolvedValue({ ok: false, message: 'Registro no disponible.' });
    component.form.setValue({ email: 'alumno@example.test', password: 'clave' });

    await component.submit();

    expect(component.error()).toBe('Registro no disponible.');
    expect(component.confirmationSent()).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('entra directamente si el proveedor devuelve sesión', async () => {
    const { component, register, navigateByUrl } = setup();
    register.mockResolvedValue({ ok: true, needsEmailConfirmation: false });
    component.form.setValue({ email: 'alumno@example.test', password: 'clave' });

    await component.submit();

    expect(navigateByUrl).toHaveBeenCalledWith('/mis-cursos');
  });
});
