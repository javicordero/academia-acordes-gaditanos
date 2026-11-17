import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { AulaRepository } from './features/aula/aula-repository';
import { PublicCoursesRepository } from './features/cursos/public-courses-repository';

const session = { user: { id: 'user-1' } } as unknown as Session;

// Dato ficticio de prueba: no corresponde a ningún curso real.
const testSlug = 'curso-de-prueba';
const aulaLoad = vi.fn().mockResolvedValue(null);

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
            status: signal('authenticated'),
            error: signal(null),
          },
        },
        {
          provide: AulaRepository,
          useValue: {
            load: aulaLoad,
            save: () => Promise.resolve(),
          },
        },
        {
          provide: PublicCoursesRepository,
          useValue: {
            list: () => Promise.resolve([]),
            detail: (slug: string) =>
              Promise.resolve(
                slug === testSlug
                  ? {
                      course: {
                        id: 'id-de-prueba',
                        slug: testSlug,
                        title: 'Curso de prueba',
                        summary: null,
                        description: null,
                        level: 'iniciacion',
                      },
                      sections: [],
                      lessons: [],
                    }
                  : null,
              ),
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

  it('carga la ficha en /cursos/:slug con su título', async () => {
    await harness.navigateByUrl(`/cursos/${testSlug}`);
    await harness.fixture.whenStable();

    const h1 = harness.routeNativeElement?.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe('Curso de prueba');
    expect(TestBed.inject(Title).getTitle()).toBe(
      'Curso · Academia Acordes Gaditanos',
    );
  });

  it('carga el aula en /aula/:courseSlug/:lessonSlug sin guard de sesión', async () => {
    await harness.navigateByUrl('/aula/curso-de-prueba/leccion-de-prueba');
    await harness.fixture.whenStable();

    const h1 = harness.routeNativeElement?.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe('Aula');
    expect(aulaLoad).toHaveBeenCalledWith(
      'curso-de-prueba',
      'leccion-de-prueba',
      'user-1',
    );
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
