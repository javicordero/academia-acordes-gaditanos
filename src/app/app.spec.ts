import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, Routes } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { SUPABASE_CONFIG } from '../environments/supabase-config';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '' } },
      ],
    }).compileComponents();
  });

  it('ofrece un enlace de salto y un destino principal', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const skipLink = element.querySelector<HTMLAnchorElement>('.skip-link');
    const main = element.querySelector<HTMLElement>('main');

    expect(skipLink?.getAttribute('href')).toBe('#contenido-principal');
    expect(main?.id).toBe('contenido-principal');
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('muestra la navegación principal en español', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const nav = element.querySelector<HTMLElement>('nav');
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('nav a'));

    expect(nav?.getAttribute('aria-label')).toBe('Navegación principal');
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Cursos',
      'Mis cursos',
      'Comunidad',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/cursos',
      '/mis-cursos',
      '/comunidad',
    ]);
  });

  it('incluye el pie de página compartido con el estado del proyecto', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const footer = element.querySelector<HTMLElement>('app-site-footer');
    const siteFooter = element.querySelector<HTMLElement>('.site-footer');

    expect(footer).not.toBeNull();
    expect(siteFooter).not.toBeNull();
    expect(siteFooter?.textContent).toContain('Proyecto en construcción');
  });

  it('avisa de la configuración pendiente y ofrece acceso real de sesión', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.config-banner')?.textContent).toContain(
      'Autenticación pendiente de configuración local',
    );
    expect(
      element.querySelector<HTMLAnchorElement>('.session-actions a[href="/auth/login"]'),
    ).not.toBeNull();
  });

  it('muestra el enlace de administración solo con rol admin', async () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        configurationPending: signal(false),
        loading: signal(false),
        session: signal({ user: { id: 'user-1' } }),
        isAdmin: signal(true),
        logout: vi.fn().mockResolvedValue({ ok: true }),
      },
    });

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector<HTMLAnchorElement>('.session-actions a[href="/admin"]'),
    ).not.toBeNull();
    expect(element.querySelector('.session-actions')?.textContent).toContain(
      'Cerrar sesión',
    );
  });
});

@Component({ template: '<p>Página de prueba del shell</p>' })
class RouteStub {}

/** Rutas mínimas: estos tests comprueban el shell, no las features lazy. */
const shellRoutes: Routes = [
  { path: 'cursos', component: RouteStub },
  { path: 'aula/:courseSlug/:lessonSlug', component: RouteStub },
  { path: 'admin/vista-previa/:courseId/:lessonId', component: RouteStub },
  { path: 'admin/curso/:courseId/vista-previa/:lessonId', component: RouteStub },
  { path: '**', component: RouteStub },
];

const aulaUrl = '/aula/curso-de-prueba/leccion-de-prueba';
const previewUrl =
  '/admin/vista-previa/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222';

describe('App shell · cabecera según la ruta', () => {
  async function createShell(url?: string): Promise<ComponentFixture<App>> {
    const router = TestBed.inject(Router);
    if (url) {
      await router.navigateByUrl(url);
    }
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  async function goto(fixture: ComponentFixture<App>, url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(shellRoutes),
        { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '' } },
      ],
    }).compileComponents();
  });

  it('muestra la cabecera y el padding del shell en /cursos', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const main = element.querySelector<HTMLElement>('main');

    expect(element.querySelector('header.site-header')).not.toBeNull();
    expect(
      element.querySelector('nav[aria-label="Navegación principal"]'),
    ).not.toBeNull();
    expect(element.querySelector('.config-banner')).not.toBeNull();
    expect(main?.classList.contains('main--padded')).toBe(true);
    expect(main?.classList.contains('main--classroom')).toBe(false);
  });

  it.each([aulaUrl, previewUrl, '/admin/curso/11111111-1111-1111-1111-111111111111/vista-previa/22222222-2222-2222-2222-222222222222'])(
    'oculta la cabecera y el padding en %s',
    async (url) => {
      const fixture = await createShell(url);
      const element = fixture.nativeElement as HTMLElement;
      const main = element.querySelector<HTMLElement>('main');

      expect(element.querySelector('header.site-header')).toBeNull();
      expect(
        element.querySelector('nav[aria-label="Navegación principal"]'),
      ).toBeNull();
      // El chrome previo al main tampoco deja franja encima del aula.
      expect(element.querySelector('.config-banner')).toBeNull();
      expect(main?.classList.contains('main--classroom')).toBe(true);
      expect(main?.classList.contains('main--padded')).toBe(false);
    },
  );

  it('restaura la cabecera al salir del aula y al volver a entrar', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;

    await goto(fixture, aulaUrl);
    expect(element.querySelector('header.site-header')).toBeNull();
    expect(element.querySelector('main')?.classList.contains('main--classroom')).toBe(true);

    await goto(fixture, '/cursos');
    expect(element.querySelector('header.site-header')).not.toBeNull();
    expect(element.querySelector('main')?.classList.contains('main--padded')).toBe(true);
    expect(fixture.componentInstance.isClassroom()).toBe(false);

    await goto(fixture, aulaUrl);
    expect(element.querySelector('header.site-header')).toBeNull();
  });

  it('no deja estado pegado tras cerrar sesión desde el aula', async () => {
    const logout = vi.fn().mockResolvedValue({ ok: true });
    TestBed.overrideProvider(AuthService, {
      useValue: {
        configurationPending: signal(false),
        loading: signal(false),
        session: signal({ user: { id: 'user-1' } }),
        isAdmin: signal(false),
        logout,
      },
    });

    const fixture = await createShell(aulaUrl);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('header.site-header')).toBeNull();

    await fixture.componentInstance.logout();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(logout).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/cursos');
    expect(element.querySelector('header.site-header')).not.toBeNull();
    expect(element.querySelector('main')?.classList.contains('main--padded')).toBe(true);
    expect(fixture.componentInstance.isClassroom()).toBe(false);
  });

  it('mantiene el skip-link y el destino principal accesibles en el aula', async () => {
    const fixture = await createShell(aulaUrl);
    const element = fixture.nativeElement as HTMLElement;
    const skipLink = element.querySelector<HTMLAnchorElement>('.skip-link');
    const main = element.querySelector<HTMLElement>('main');

    expect(skipLink?.getAttribute('href')).toBe('#contenido-principal');
    expect(element.querySelector('#contenido-principal')).toBe(main);
    expect(main?.getAttribute('tabindex')).toBe('-1');
    // Sin cabecera no quedan controles enfocables invisibles antes del main.
    expect(element.querySelector('header a, header button')).toBeNull();
    expect(getComputedStyle(main!).display).not.toBe('none');
  });
});
