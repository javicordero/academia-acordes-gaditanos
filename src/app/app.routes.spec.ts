import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Routes, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Session } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { routes } from './app.routes';
import { adminGuard } from './core/auth/admin.guard';
import { AuthService } from './core/auth/auth.service';
import { authGuard } from './core/auth/auth.guard';
import { SUPABASE_CLIENT } from './core/supabase/supabase-client';
import { AulaRepository } from './features/aula/aula-repository';
import { PublicCoursesRepository } from './features/cursos/public-courses-repository';
import { LessonFavoritesRepository } from './features/favoritos/repository';
import { PerfilRepository } from './features/perfil/perfil-repository';

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
        // Sin cliente Supabase el foro muestra su estado honesto sin red.
        { provide: SUPABASE_CLIENT, useValue: null },
        { provide: PerfilRepository, useValue: { load: () => Promise.resolve(null) } },
        { provide: LessonFavoritesRepository, useValue: { list: () => Promise.resolve([]) } },
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

  it('muestra la portada en la raíz', async () => {
    await harness.navigateByUrl('/');
    await harness.fixture.whenStable();

    const root = harness.routeNativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Academia de Guitarra');
    expect(root.querySelector('.home-subtitle')?.textContent?.trim()).toBe('De Acordes Gaditanos');
    expect(root.querySelector('.home-lead')?.textContent).toContain('Carnaval de Cádiz');
    expect(TestBed.inject(Title).getTitle()).toBe('Academia de Guitarra');
  });

  it('protege /perfil con el guard de autenticación', () => {
    expect(routes.find(route => route.path === 'perfil')?.canActivate).toContain(authGuard);
  });

  it('carga /favoritos de forma lazy con su título', async () => {
    const favorites = routes.find((route) => route.path === 'favoritos');

    expect(favorites?.title).toBe('Mis favoritos · Academia de Guitarra');
    expect(favorites?.loadComponent).toBeTypeOf('function');
    expect(favorites?.canActivate).toContain(authGuard);

    await harness.navigateByUrl('/favoritos');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/favoritos');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe('Mis favoritos');
    expect(TestBed.inject(Title).getTitle()).toBe('Mis favoritos · Academia de Guitarra');
  });

  it.each([
    ['/cursos', 'Cursos', 'Cursos · Academia de Guitarra'],
    ['/mis-cursos', 'Mis cursos', 'Mis cursos · Academia de Guitarra'],
    ['/perfil', 'Mi perfil', 'Mi perfil · Academia de Guitarra'],
    ['/foro', 'Foro', 'Foro · Academia de Guitarra'],
  ])('carga %s con su título', async (url, heading, title) => {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();

    const h1 = harness.routeNativeElement?.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe(heading);
    expect(TestBed.inject(Title).getTitle()).toBe(title);
  });

  it('monta el foro con loadChildren bajo /foro, sin loadComponent ni guard nuevo', async () => {
    const foro = routes.find((route) => route.path === 'foro');

    expect(foro?.canActivate).toBeUndefined();
    expect(foro?.loadComponent).toBeUndefined();
    expect(foro?.loadChildren).toBeTypeOf('function');

    const hijas = (await foro!.loadChildren!()) as Routes;

    expect(hijas.map((route) => route.path)).toEqual([
      '',
      ':categoryId',
      ':categoryId/:threadId',
    ]);
    expect(hijas.map((route) => route.title)).toEqual([
      'Foro · Academia de Guitarra',
      'Hilos del foro · Academia de Guitarra',
      'Hilo del foro · Academia de Guitarra',
    ]);
    expect(hijas.every((route) => typeof route.loadComponent === 'function')).toBe(true);
  });

  it('redirige el enlace histórico /comunidad a /foro', async () => {
    const comunidad = routes.find((route) => route.path === 'comunidad');

    expect(comunidad?.redirectTo).toBe('/foro');
    expect(comunidad?.pathMatch).toBe('full');
    expect(comunidad?.loadChildren).toBeUndefined();
    expect(comunidad?.canActivate).toBeUndefined();

    await harness.navigateByUrl('/comunidad');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/foro');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe('Foro');
    expect(TestBed.inject(Title).getTitle()).toBe('Foro · Academia de Guitarra');
  });

  it('define las redirecciones profundas de /comunidad antes de la raíz', () => {
    const category = routes.find((route) => route.path === 'comunidad/:categoryId');
    const thread = routes.find((route) => route.path === 'comunidad/:categoryId/:threadId');

    expect(category?.redirectTo).toBe('foro/:categoryId');
    expect(category?.pathMatch).toBe('full');
    expect(category?.canActivate).toBeUndefined();
    expect(category?.loadChildren).toBeUndefined();
    expect(thread?.redirectTo).toBe('foro/:categoryId/:threadId');
    expect(thread?.pathMatch).toBe('full');
    expect(thread?.canActivate).toBeUndefined();
    expect(thread?.loadChildren).toBeUndefined();

    const rootIndex = routes.findIndex((route) => route.path === 'comunidad');
    expect(routes.findIndex((route) => route.path === 'comunidad/:categoryId')).toBeLessThan(rootIndex);
    expect(routes.findIndex((route) => route.path === 'comunidad/:categoryId/:threadId')).toBeLessThan(rootIndex);
  });

  it.each([
    [
      '/comunidad/11111111-1111-1111-1111-111111111111',
      '/foro/11111111-1111-1111-1111-111111111111',
      'Hilos del foro',
      'Hilos del foro · Academia de Guitarra',
    ],
    [
      '/comunidad/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222',
      '/foro/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222',
      'Hilo del foro',
      'Hilo del foro · Academia de Guitarra',
    ],
  ])('redirige %s a %s conservando el título', async (oldUrl, newUrl, heading, title) => {
    await harness.navigateByUrl(oldUrl);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(newUrl);
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe(heading);
    expect(TestBed.inject(Title).getTitle()).toBe(title);
  });

  it.each([
    [
      '/foro/11111111-1111-1111-1111-111111111111',
      'Hilos del foro',
      'Hilos del foro · Academia de Guitarra',
    ],
    [
      '/foro/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222',
      'Hilo del foro',
      'Hilo del foro · Academia de Guitarra',
    ],
  ])('carga %s del foro con su título', async (url, heading, title) => {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(url);
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe(heading);
    expect(TestBed.inject(Title).getTitle()).toBe(title);
  });

  it('carga la ficha en /cursos/:slug con su título', async () => {
    await harness.navigateByUrl(`/cursos/${testSlug}`);
    await harness.fixture.whenStable();

    const h1 = harness.routeNativeElement?.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe('Curso de prueba');
    expect(TestBed.inject(Title).getTitle()).toBe(
      'Curso · Academia de Guitarra',
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

  it('rechaza la vista previa para usuarios sin rol administrador', async () => {
    await harness.navigateByUrl('/admin/vista-previa/11111111-1111-1111-1111-111111111111');
    expect(TestBed.inject(Router).url).toBe('/sin-acceso');
  });

  it('conserva las rutas legales y su navegación', async () => {
    const legal = routes.find((route) => route.path === 'legal');

    expect(legal?.loadChildren).toBeTypeOf('function');
    const legales = (await legal!.loadChildren!()) as Routes;
    expect(legales.map((route) => route.path)).toEqual([
      'aviso-legal',
      'privacidad',
      'cookies',
      'terminos',
      'reembolsos',
      '',
    ]);

    await harness.navigateByUrl('/legal/privacidad');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/legal/privacidad');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe(
      'Política de privacidad',
    );
    expect(TestBed.inject(Title).getTitle()).toBe('Privacidad · Academia de Guitarra');
  });

  it('conserva el guard de administración, sus alias históricos y el aula', () => {
    const admin = routes.find((route) => route.path === 'admin');
    const alias = admin?.children?.map((route) => route.path) ?? [];

    expect(admin?.canActivate).toContain(adminGuard);
    expect(alias).toContain('vista-previa/:courseId/:lessonId');
    expect(alias).toContain('vista-previa/:courseId');
    expect(routes.find((route) => route.path === 'aula')?.loadChildren).toBeTypeOf('function');
  });

  it('conserva 404, legales, admin, aula y favoritos tras mover el foro a /foro', () => {
    const paths = routes.map((route) => route.path);

    expect(paths).toContain('foro');
    expect(paths).toContain('comunidad');
    expect(paths).toContain('favoritos');
    expect(routes.find((route) => route.path === 'not-found')?.loadComponent).toBeTypeOf('function');
    expect(routes.find((route) => route.path === '**')?.loadComponent).toBeTypeOf('function');
    expect(routes.find((route) => route.path === 'legal')?.loadChildren).toBeTypeOf('function');
    expect(routes.find((route) => route.path === 'admin')?.canActivate).toContain(adminGuard);
    expect(routes.find((route) => route.path === 'aula')?.loadChildren).toBeTypeOf('function');
    expect(routes.find((route) => route.path === 'favoritos')?.canActivate).toContain(authGuard);
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
