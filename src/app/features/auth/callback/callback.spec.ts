import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { AuthCallback } from './callback';

describe('AuthCallback', () => {
  function setup(queryParams: Record<string, string>) {
    const completeEmailLink = vi.fn();
    const completeEmailOtpLink = vi.fn();
    const navigateByUrl = vi.fn().mockResolvedValue(true);
    const navigate = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      imports: [AuthCallback],
      providers: [
        {
          provide: AuthService,
          useValue: { completeEmailLink, completeEmailOtpLink },
        },
        { provide: Router, useValue: { navigateByUrl, navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(queryParams) },
          },
        },
      ],
    });

    return {
      component: TestBed.createComponent(AuthCallback).componentInstance,
      completeEmailLink,
      completeEmailOtpLink,
      navigateByUrl,
      navigate,
    };
  }

  it('canjea el código y envía la recuperación a nueva contraseña', async () => {
    const { component, completeEmailLink, navigateByUrl } = setup({
      code: 'codigo-de-prueba',
      next: '/auth/actualizar-contrasena',
    });
    completeEmailLink.mockResolvedValue({ ok: true });

    await component.ngOnInit();

    expect(completeEmailLink).toHaveBeenCalledWith('codigo-de-prueba');
    expect(navigateByUrl).toHaveBeenCalledWith(
      '/auth/actualizar-contrasena',
      { replaceUrl: true },
    );
  });

  it('verifica token_hash de recuperación con su tipo OT', async () => {
    const { component, completeEmailOtpLink, navigateByUrl } = setup({
      token_hash: 'hash-de-prueba',
      type: 'recovery',
      next: '/auth/actualizar-contrasena',
    });
    completeEmailOtpLink.mockResolvedValue({ ok: true });

    await component.ngOnInit();

    expect(completeEmailOtpLink).toHaveBeenCalledWith(
      'hash-de-prueba',
      'recovery',
    );
    expect(navigateByUrl).toHaveBeenCalledWith(
      '/auth/actualizar-contrasena',
      { replaceUrl: true },
    );
  });

  it('ignora un next externo y usa la confirmación por defecto', async () => {
    const { component, completeEmailLink, navigateByUrl } = setup({
      code: 'codigo-de-prueba',
      next: 'https://ejemploexterno.invalid',
    });
    completeEmailLink.mockResolvedValue({ ok: true });

    await component.ngOnInit();

    expect(navigateByUrl).toHaveBeenCalledWith('/auth/cuenta-confirmada', {
      replaceUrl: true,
    });
  });

  it('limpia los parámetros del enlace y no expone el error técnico', async () => {
    const { component, completeEmailLink, navigate } = setup({
      error_code: 'otp_expired',
      error_description: 'detalle-tecnico-del-proveedor',
    });
    completeEmailLink.mockResolvedValue({ ok: true });

    await component.ngOnInit();

    expect(completeEmailLink).not.toHaveBeenCalled();
    expect(component.state()).toBe('error');
    expect(component.message()).not.toContain('detalle-tecnico');
    expect(navigate).toHaveBeenCalledWith(['/auth/callback'], {
      replaceUrl: true,
      queryParams: {},
    });
  });

  it('informa de un código caducado sin guardarlo', async () => {
    const { component, completeEmailLink, navigate } = setup({
      code: 'codigo-caducado',
      next: '/auth/actualizar-contrasena',
    });
    completeEmailLink.mockResolvedValue({
      ok: false,
      message: 'El enlace ha caducado o no es válido. Solicita uno nuevo.',
    });

    await component.ngOnInit();

    expect(component.state()).toBe('error');
    expect(component.message()).toContain('caducado');
    expect(navigate).toHaveBeenCalledWith(['/auth/callback'], {
      replaceUrl: true,
      queryParams: {},
    });
  });
});
