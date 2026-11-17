import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

const session = { user: { id: 'user-1' } } as unknown as Session;

describe('Routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        {
          provide: AuthService,
          useValue: {
            whenInitialized: () => Promise.resolve(),
            whenRoleResolved: () => Promise.resolve(),
            session: () => session,
            isAdmin: () => false,
          },
        },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('redirige la raíz a /cursos', async () => {
    await harness.navigateByUrl('/');

    expect(TestBed.inject(Router).url).toBe('/cursos');
  });

  it.each([
    ['/cursos', 'Cursos', 'Cursos · Academia Acordes Gaditanos'],
    ['/mis-cursos', 'Mis cursos', 'Mis cursos · Academia Acordes Gaditanos'],
    ['/comunidad', 'Comunidad', 'Comunidad · Academia Acordes Gaditanos'],
  ])('carga %s con su título', async (url, heading, title) => {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();

    const h1 = harness.routeNativeElement?.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe(heading);
    expect(TestBed.inject(Title).getTitle()).toBe(title);
  });

  it('muestra la página 404 para una ruta desconocida', async () => {
    await harness.navigateByUrl('/ruta-que-no-existe');
    await harness.fixture.whenStable();

    const element = harness.routeNativeElement;
    const h1 = element?.querySelector('h1');
    const link = element?.querySelector<HTMLAnchorElement>('a.button');

    expect(h1?.textContent?.trim()).toBe('Página no encontrada');
    expect(link?.getAttribute('href')).toBe('/cursos');
  });

  it('sirve la página 404 también en /not-found', async () => {
    await harness.navigateByUrl('/not-found');
    await harness.fixture.whenStable();

    const h1 = harness.routeNativeElement?.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe('Página no encontrada');
  });
});
