import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { safeLoginReturnUrl } from './return-url';

/** Exige sesión y espera la restauración inicial para evitar carreras. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenInitialized();

  if (auth.session()) {
    return true;
  }

  const returnUrl = safeLoginReturnUrl(router.url);

  return router.createUrlTree(['/auth/login'], {
    queryParams: returnUrl ? { returnUrl } : {},
  });
};
