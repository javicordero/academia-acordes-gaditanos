import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { UpdatePassword } from './update-password';

describe('UpdatePassword', () => {
  function setup() {
    const updatePassword = vi.fn();
    const logout = vi.fn().mockResolvedValue({ ok: true });

    TestBed.configureTestingModule({
      imports: [UpdatePassword],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            updatePassword,
            logout,
            configurationPending: signal(false),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(UpdatePassword);

    return {
      fixture,
      component: fixture.componentInstance,
      updatePassword,
      logout,
    };
  }

  it('rechaza contraseñas que no coinciden antes de llamar al servicio', async () => {
    const { component, updatePassword } = setup();
    component.form.setValue({
      password: 'clave-nueva',
      confirmPassword: 'clave-distinta',
    });

    await component.submit();

    expect(component.error()).toBe('Las contraseñas no coinciden.');
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('actualiza y cierra la sesión por seguridad', async () => {
    const { component, updatePassword, logout } = setup();
    updatePassword.mockResolvedValue({ ok: true });
    component.form.setValue({
      password: 'clave-nueva',
      confirmPassword: 'clave-nueva',
    });

    await component.submit();

    expect(updatePassword).toHaveBeenCalledWith('clave-nueva');
    expect(logout).toHaveBeenCalled();
    expect(component.updated()).toBe(true);
    expect(component.logoutConfirmed()).toBe(true);
  });

  it('no afirma la salida si signOut falla tras cambiar la contraseña', async () => {
    const { fixture, component, updatePassword, logout } = setup();
    updatePassword.mockResolvedValue({ ok: true });
    logout.mockResolvedValue({
      ok: false,
      message: 'No se pudo cerrar la sesión.',
    });
    component.form.setValue({
      password: 'clave-nueva',
      confirmPassword: 'clave-nueva',
    });

    await component.submit();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(component.updated()).toBe(true);
    expect(component.logoutConfirmed()).toBe(false);
    expect(element.textContent).toContain('contraseña se ha cambiado');
    expect(element.textContent).toContain('no se ha podido confirmar el cierre');
    expect(element.textContent).not.toContain(
      'vuelve a iniciar sesión con la nueva contraseña',
    );
  });
});
