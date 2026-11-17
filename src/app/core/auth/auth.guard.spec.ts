import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Session } from '@supabase/supabase-js';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;
const session = { user: { id: 'user-1' } } as unknown as Session;

function createAuth(overrides: {
  session?: Session | null;
  isAdmin?: boolean;
  initialized?: Promise<void>;
} = {}) {
  return {
    whenInitialized: vi.fn(
      () => overrides.initialized ?? Promise.resolve(),
    ),
    whenRoleResolved: vi.fn().mockResolvedValue(undefined),
    session: vi.fn(() => overrides.session ?? null),
    isAdmin: vi.fn(() => overrides.isAdmin ?? false),
  } as unknown as AuthService;
}

function createRouter(url = '/admin') {
  const createUrlTree = vi.fn((commands: unknown[], extras?: unknown) => ({
    commands,
    extras,
  }));

  return {
    url,
    createUrlTree,
  } as unknown as Router;
}

function configure(auth: AuthService, router: Router): void {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
}

describe('guards de autenticación', () => {
  it('espera a la inicialización antes de decidir', async () => {
    const deferred: { resolve: (() => void) | null } = { resolve: null };
    const initialized = new Promise<void>((resolve) => {
      deferred.resolve = resolve;
    });
    configure(createAuth({ initialized }), createRouter());

    const auth = TestBed.inject(AuthService);
    const result = TestBed.runInInjectionContext(() =>
      authGuard(route, state),
    ) as Promise<unknown>;
    let resolved = false;
    void result.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(auth.whenInitialized).toHaveBeenCalled();
    expect(resolved).toBe(false);

    deferred.resolve?.();
    expect(await result).toBeTruthy();
  });

  it('redirige a login con un returnUrl interno al no haber sesión', async () => {
    const router = createRouter('/admin');
    configure(createAuth(), router);

    await TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/admin' },
    });
  });

  it('no propaga returnUrl externo', async () => {
    const router = createRouter('https://ejemploexterno.invalid/admin');
    configure(createAuth(), router);

    await TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: {},
    });
  });

  it('permite el paso con sesión iniciada', async () => {
    const router = createRouter();
    configure(createAuth({ session }), router);

    expect(
      await TestBed.runInInjectionContext(() => authGuard(route, state)),
    ).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirige a login si no hay sesión en /admin', async () => {
    const router = createRouter('/admin');
    configure(createAuth(), router);

    await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/admin' },
    });
  });

  it('espera el rol y rechaza a un usuario sin rol admin', async () => {
    const auth = createAuth({ session, isAdmin: false });
    const router = createRouter();
    configure(auth, router);

    await TestBed.runInInjectionContext(() => adminGuard(route, state));

    expect(auth.whenRoleResolved).toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/sin-acceso']);
  });

  it('permite /admin con sesión y rol admin', async () => {
    const router = createRouter();
    configure(createAuth({ session, isAdmin: true }), router);

    expect(
      await TestBed.runInInjectionContext(() => adminGuard(route, state)),
    ).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });
});
