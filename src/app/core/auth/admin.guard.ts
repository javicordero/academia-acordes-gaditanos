import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { requestedLoginReturnUrl } from './return-url';

/**
 * Exige sesión y rol admin comprobado contra `public.user_roles`.
 *
 * La consulta solo devuelve la fila propia del usuario por RLS. No se lee el rol
 * de metadatos editables ni se confía en ocultar la ruta: el backend sigue
 * siendo la barrera real.
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenInitialized();

  if (!auth.session()) {
    const returnUrl = requestedLoginReturnUrl(router);

    return router.createUrlTree(['/auth/login'], {
      queryParams: returnUrl ? { returnUrl } : {},
    });
  }

  await auth.whenRoleResolved();

  if (auth.isAdmin()) {
    return true;
  }

  return router.createUrlTree(['/sin-acceso']);
};
