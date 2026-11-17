import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  function setup(queryParams: Record<string, string> = {}) {
    const login = vi.fn();
    const navigateByUrl = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        {
          provide: AuthService,
          useValue: { login, configurationPending: signal(false) },
        },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(queryParams) },
          },
        },
      ],
    });

    return {
      component: TestBed.createComponent(Login).componentInstance,
      login,
      navigateByUrl,
    };
  }

  it('inicia sesión y respeta un returnUrl interno', async () => {
    const { component, login, navigateByUrl } = setup({ returnUrl: '/admin' });
    login.mockResolvedValue({ ok: true });
    component.form.setValue({ email: ' alumno@example.test ', password: 'clave' });

    await component.submit();

    expect(login).toHaveBeenCalledWith('alumno@example.test', 'clave');
    expect(navigateByUrl).toHaveBeenCalledWith('/admin');
    expect(component.error()).toBeNull();
  });

  it('ignora un returnUrl externo y muestra el error sin filtrar datos', async () => {
    const { component, login, navigateByUrl } = setup({
      returnUrl: 'https://ejemploexterno.invalid',
    });
    login.mockResolvedValue({
      ok: false,
      message: 'Correo o contraseña incorrectos.',
    });
    component.form.setValue({ email: 'alumno@example.test', password: 'clave' });

    await component.submit();

    expect(component.error()).toBe('Correo o contraseña incorrectos.');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('no envía el formulario si falta la contraseña', async () => {
    const { component, login } = setup();
    component.form.setValue({ email: 'alumno@example.test', password: '' });

    await component.submit();

    expect(login).not.toHaveBeenCalled();
    expect(component.form.controls.password.touched).toBe(true);
  });
});
