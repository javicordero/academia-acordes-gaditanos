import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter, Routes } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { CONSENT_STORAGE_KEY } from './core/consent/consent.service';
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
    expect(
      element.querySelector<HTMLAnchorElement>('.session-actions a[href="/perfil"]'),
    ).not.toBeNull();
    expect(
      element.querySelector<HTMLAnchorElement>('.session-actions a[href="/auth/login"]'),
    ).toBeNull();
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
  {
    path: 'legal/cookies',
    data: { page: 'cookies' },
    loadComponent: () => import('./features/legal/legal').then((m) => m.Legal),
  },
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
    // Creamos el shell antes de navegar para que su primer NavigationEnd sea el
    // de carga inicial y lo consuma el skip(1) del foco, no una navegación posterior.
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    if (url) {
      await TestBed.inject(Router).navigateByUrl(url);
    }
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

  it('la marca lleva al índice y «Cursos» sigue llevando a /cursos', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const brand = element.querySelector<HTMLAnchorElement>('.brand')!;
    const cursos = element.querySelector<HTMLAnchorElement>('nav a[href="/cursos"]')!;

    expect(brand.getAttribute('href')).toBe('/');
    expect(brand.getAttribute('aria-label')).toContain('Academia Acordes Gaditanos');
    expect(brand.textContent).toContain('Academia');
    expect(brand.textContent).toContain('Acordes Gaditanos');
    expect(cursos.textContent?.trim()).toBe('Cursos');

    brand.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');

    cursos.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/cursos');
  });

  it('expone la navegación y el salto con nombres accesibles', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const nav = element.querySelector<HTMLElement>(
      'nav[aria-label="Navegación principal"]',
    )!;
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    const skipLink = element.querySelector<HTMLAnchorElement>('.skip-link')!;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;

    expect(element.firstElementChild).toBe(skipLink);
    expect(skipLink.textContent?.trim()).toBe('Saltar al contenido principal');
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
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-label')).toBe('Abrir menú');
    expect(toggle.getAttribute('aria-controls')).toBe('site-navigation');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('marca solo el enlace activo con aria-current="page"', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const currents = () =>
      Array.from(element.querySelectorAll<HTMLAnchorElement>('nav a')).map(
        (link) => link.getAttribute('aria-current'),
      );

    expect(currents()).toEqual(['page', null, null]);

    await goto(fixture, '/comunidad');
    expect(currents()).toEqual([null, null, 'page']);
    expect(
      element
        .querySelector<HTMLAnchorElement>('nav a[aria-current="page"]')
        ?.getAttribute('href'),
    ).toBe('/comunidad');
  });

  it('el salto lleva al único main del shell', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const skipLink = element.querySelector<HTMLAnchorElement>('.skip-link')!;
    const mains = element.querySelectorAll('main');

    expect(mains).toHaveLength(1);
    expect(skipLink.getAttribute('href')).toBe(`#${mains[0].id}`);
    expect(mains[0].getAttribute('tabindex')).toBe('-1');
    skipLink.focus();
    expect(document.activeElement).toBe(skipLink);
  });

  it('no roba el foco en la carga inicial', async () => {
    const centinela = document.createElement('button');
    centinela.type = 'button';
    centinela.textContent = 'Foco previo';
    document.body.appendChild(centinela);
    centinela.focus();
    expect(document.activeElement).toBe(centinela);

    await createShell('/cursos');

    expect(document.activeElement).toBe(centinela);
    centinela.remove();
  });

  it('mueve el foco al contenido principal en una navegación explícita', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const main = element.querySelector<HTMLElement>('main')!;
    const skipLink = element.querySelector<HTMLAnchorElement>('.skip-link')!;

    skipLink.focus();
    expect(document.activeElement).toBe(skipLink);

    await goto(fixture, '/comunidad');

    expect(document.activeElement).toBe(main);
  });

  it('el hamburger nombra el panel y mantiene aria-expanded sincronizado', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const panel = element.querySelector<HTMLElement>('#site-navigation')!;

    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Abrir menú');
    expect(panel.classList.contains('is-open')).toBe(false);
    expect(panel.getAttribute('role')).toBeNull();

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(panel.classList.contains('is-open')).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Abrir menú');
    expect(panel.classList.contains('is-open')).toBe(false);
    expect(panel.getAttribute('role')).toBeNull();
  });

  it('Escape cierra el menú y devuelve el foco al hamburger', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const panel = element.querySelector<HTMLElement>('#site-navigation')!;

    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    await fixture.whenStable();

    const link = panel.querySelector<HTMLAnchorElement>('nav a')!;
    link.focus();
    expect(document.activeElement).toBe(link);

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Abrir menú');
    expect(panel.classList.contains('is-open')).toBe(false);
    expect(panel.getAttribute('role')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('al elegir un enlace del menú se cierra y la navegación lleva el foco a main', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const panel = element.querySelector<HTMLElement>('#site-navigation')!;
    const main = element.querySelector<HTMLElement>('main')!;

    document.body.style.overflow = '';
    toggle.click();
    await fixture.whenStable();
    expect(document.body.style.overflow).toBe('hidden');

    panel.querySelector<HTMLAnchorElement>('a[href="/comunidad"]')!.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/comunidad');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
    // El foco lo mueve NavigationEnd de app.ts, no un handler del enlace.
    expect(document.activeElement).toBe(main);
  });

  it('muestra solo Iniciar sesión para una visita anónima', async () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        configurationPending: signal(false),
        loading: signal(false),
        session: signal(null),
        isAdmin: signal(false),
        logout: vi.fn().mockResolvedValue({ ok: true }),
      },
    });

    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const sessionActions = element.querySelector<HTMLElement>('.session-actions')!;

    expect(
      sessionActions.querySelector<HTMLAnchorElement>('a[href="/auth/login"]')
        ?.textContent?.trim(),
    ).toBe('Iniciar sesión');
    expect(sessionActions.querySelector('a[href="/perfil"]')).toBeNull();
    expect(sessionActions.querySelector('a[href="/admin"]')).toBeNull();
    expect(sessionActions.textContent).not.toContain('Cerrar sesión');
  });

  it('muestra perfil y cierre de sesión, pero no Administración, para un alumno', async () => {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        configurationPending: signal(false),
        loading: signal(false),
        session: signal({ user: { id: 'user-1' } }),
        isAdmin: signal(false),
        logout: vi.fn().mockResolvedValue({ ok: true }),
      },
    });

    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const sessionActions = element.querySelector<HTMLElement>('.session-actions')!;

    expect(
      sessionActions.querySelector<HTMLAnchorElement>('a[href="/perfil"]')
        ?.textContent?.trim(),
    ).toBe('Mi perfil');
    expect(sessionActions.querySelector('a[href="/admin"]')).toBeNull();
    expect(sessionActions.querySelector('a[href="/auth/login"]')).toBeNull();
    expect(sessionActions.textContent).toContain('Cerrar sesión');
  });

  it('declara estilos locales responsive y objetivos táctiles', async () => {
    await createShell('/cursos');
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(css).toContain('nav-toggle');
    expect(css).toContain('menu-close');
    expect(css).toContain('is-open');
    expect(css).toContain('@media');
    expect(css).toContain('44px');
    expect(css).toContain('--focus');
    expect(css).toContain('min-width: 48rem');
    expect(css).toContain('max-width: 47.99rem');
    expect(css).toContain('100dvh');
    expect(css).toContain('translateX(-100%)');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('oculta el hamburger en escritorio y deja la navegación en la cabecera', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector<HTMLElement>('header.site-header')!;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const close = element.querySelector<HTMLButtonElement>('.menu-close')!;
    const panel = element.querySelector<HTMLElement>('#site-navigation')!;
    const nav = element.querySelector<HTMLElement>(
      'nav[aria-label="Navegación principal"]',
    )!;

    expect(getComputedStyle(toggle).display).toBe('none');
    expect(getComputedStyle(close).display).toBe('none');
    expect(getComputedStyle(panel).display).not.toBe('none');
    expect(header.contains(nav)).toBe(true);
    expect(header.contains(panel)).toBe(true);
    expect(panel.getAttribute('role')).toBeNull();
    expect(panel.getAttribute('aria-modal')).toBeNull();
  });

  it('abre un diálogo a pantalla completa y mueve el foco al primer enlace', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const panel = element.querySelector<HTMLElement>('#site-navigation')!;
    const firstLink = panel.querySelector<HTMLAnchorElement>('nav a')!;

    toggle.focus();
    toggle.click();
    await fixture.whenStable();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(toggle.getAttribute('aria-haspopup')).toBe('true');
    expect(panel.classList.contains('is-open')).toBe(true);
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-label')).toBe('Menú de navegación');
    expect(document.activeElement).toBe(firstLink);
  });

  it('la X del panel solo se muestra mientras el menú está abierto', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const close = element.querySelector<HTMLButtonElement>('.menu-close')!;

    expect(close.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(close.getAttribute('title')).toBeNull();
    expect(close.classList.contains('is-visible')).toBe(false);
    expect(getComputedStyle(close).display).toBe('none');

    toggle.click();
    await fixture.whenStable();

    expect(close.classList.contains('is-visible')).toBe(true);
    expect(close.getAttribute('title')).toBe('Cerrar menú');
    expect(getComputedStyle(close).display).not.toBe('none');
  });

  it('la X cierra el panel, devuelve el foco al hamburger y restaura el scroll', async () => {
    document.body.style.overflow = '';
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const close = element.querySelector<HTMLButtonElement>('.menu-close')!;

    toggle.focus();
    toggle.click();
    await fixture.whenStable();
    expect(document.body.style.overflow).toBe('hidden');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    close.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(close.classList.contains('is-visible')).toBe(false);
    expect(close.getAttribute('title')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Abrir menú');
    expect(document.activeElement).toBe(toggle);
    expect(document.body.style.overflow).toBe('');
  });

  it('bloquea el scroll del body mientras el panel está abierto y lo restaura', async () => {
    document.body.style.overflow = '';
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;

    toggle.click();
    await fixture.whenStable();
    expect(document.body.style.overflow).toBe('hidden');

    toggle.click();
    await fixture.whenStable();
    expect(document.body.style.overflow).toBe('');
  });

  it('la trampa de foco cicla entre el toggle y los controles del panel', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector<HTMLElement>('header.site-header')!;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const panel = element.querySelector<HTMLElement>('#site-navigation')!;

    toggle.click();
    await fixture.whenStable();

    const controls = [
      toggle,
      ...Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')),
    ];
    const last = controls[controls.length - 1];

    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await fixture.whenStable();
    expect(document.activeElement).toBe(toggle);

    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await fixture.whenStable();
    expect(document.activeElement).toBe(controls[1]);

    controls[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, shiftKey: true }),
    );
    await fixture.whenStable();
    expect(document.activeElement).toBe(toggle);

    // Escape también funciona si el foco está en el propio toggle.
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('cierra el menú al cambiar de ruta, aunque no se pulse un enlace', async () => {
    document.body.style.overflow = '';
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;

    toggle.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    await goto(fixture, '/comunidad');
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('');
  });

  it('no deja el menú abierto al entrar al aula y volver', async () => {
    const fixture = await createShell('/cursos');
    const host = fixture.nativeElement as HTMLElement;
    let toggle = host.querySelector<HTMLButtonElement>('.nav-toggle')!;

    toggle.click();
    await fixture.whenStable();
    await goto(fixture, aulaUrl);

    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(host.querySelector('.nav-toggle')).toBeNull();

    await goto(fixture, '/cursos');
    toggle = host.querySelector<HTMLButtonElement>('.nav-toggle')!;
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('cierra el menú al cerrar sesión', async () => {
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

    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const logoutButton = element.querySelector<HTMLButtonElement>('.link-button')!;

    document.body.style.overflow = '';
    toggle.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    logoutButton.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
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
    // Sin cabecera no quedan controles enfocables invisibles antes del main,
    // ni un segundo hamburger que compita con el del aula.
    expect(element.querySelector('header a, header button')).toBeNull();
    expect(element.querySelector('.nav-toggle')).toBeNull();
    expect(getComputedStyle(main!).display).not.toBe('none');
  });

  it('mantiene el aviso de cookies fuera del @if de la cabecera, también en el aula', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;

    const publicBanner = element.querySelector<HTMLElement>('app-cookie-banner');
    expect(publicBanner).not.toBeNull();
    expect(
      publicBanner?.querySelector<HTMLElement>('section[aria-label="Preferencias de cookies"]'),
    ).not.toBeNull();
    expect(publicBanner?.classList.contains('cookie-banner--in-classroom')).toBe(false);
    expect(element.querySelector('header.site-header')).not.toBeNull();

    await goto(fixture, aulaUrl);

    const classroomBanner = element.querySelector<HTMLElement>('app-cookie-banner');
    expect(classroomBanner).not.toBeNull();
    expect(
      classroomBanner?.querySelector<HTMLElement>('section[aria-label="Preferencias de cookies"]'),
    ).not.toBeNull();
    expect(classroomBanner?.classList.contains('cookie-banner--in-classroom')).toBe(true);
    expect(element.querySelector('header.site-header')).toBeNull();
    expect(element.querySelector('main')?.classList.contains('main--classroom')).toBe(true);
  });

  it('tras decidir no muestra la barra guardada y solo se reabre desde /legal/cookies', async () => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const banner = element.querySelector<HTMLElement>('app-cookie-banner')!;

    expect(banner.textContent).not.toContain('Preferencias de cookies guardadas.');

    const accept = Array.from(banner.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Aceptar todo',
    )!;
    accept.click();
    await fixture.whenStable();

    expect(element.textContent).not.toContain('Preferencias de cookies guardadas.');
    expect(element.textContent).not.toContain('Cambiar preferencias');
    expect(banner.querySelector('section[aria-label="Preferencias de cookies"]')).toBeNull();
    expect(getComputedStyle(banner).display).toBe('none');

    await goto(fixture, '/legal/cookies');
    const change = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Cambiar preferencias',
    )!;
    expect(change).toBeDefined();
    change.click();
    await fixture.whenStable();

    expect(element.querySelector('app-cookie-banner section[aria-label="Preferencias de cookies"]')).not.toBeNull();
    expect(getComputedStyle(banner).display).not.toBe('none');
    localStorage.removeItem(CONSENT_STORAGE_KEY);
  });
});
