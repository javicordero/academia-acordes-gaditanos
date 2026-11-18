import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';
import { vi } from 'vitest';

import { Login } from '../../features/auth/login/login';
import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Component({ template: '<p>Área protegida</p>' })
class ProtectedArea {}

/** Rutas mínimas reales: los guards y el login se ejecutan sin mocks de Router. */
const routes: Routes = [
  { path: '', component: ProtectedArea },
  { path: 'admin', component: ProtectedArea, canActivate: [adminGuard] },
  { path: 'mis-cursos', component: ProtectedArea, canActivate: [authGuard] },
  { path: 'auth/login', component: Login },
];

describe('returnUrl desde rutas protegidas', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    const session = signal<Session | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        {
          provide: AuthService,
          useValue: {
            session,
            isAdmin: signal(true),
            configurationPending: signal(false),
            whenInitialized: () => Promise.resolve(),
            whenRoleResolved: () => Promise.resolve(),
            login: vi.fn(async () => {
              session.set({ user: { id: 'user-1' } } as unknown as Session);
              return { ok: true };
            }),
          },
        },
      ],
    });
    harness = await RouterTestingHarness.create('/');
  });

  it.each(['/admin', '/mis-cursos'])(
    'de %s a login y de vuelta a la ruta pedida tras iniciar sesión',
    async (url) => {
      await harness.navigateByUrl(url);
      await harness.fixture.whenStable();

      const router = TestBed.inject(Router);
      expect(router.url).toBe(`/auth/login?returnUrl=${encodeURIComponent(url)}`);

      const login = harness.routeDebugElement?.componentInstance as Login;
      expect(login).toBeInstanceOf(Login);
      login.form.setValue({ email: 'alumno@example.test', password: 'clave' });
      await login.submit();
      await harness.fixture.whenStable();

      expect(router.url).toBe(url);
      expect(harness.routeNativeElement?.textContent).toContain('Área protegida');
    },
  );
});
