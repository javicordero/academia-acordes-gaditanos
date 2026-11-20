import { readFileSync } from 'node:fs';
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
      'Foro',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/cursos',
      '/mis-cursos',
      '/foro',
    ]);
  });

  it('mantiene /foro con el texto visible «Foro»', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const foro = element.querySelector<HTMLAnchorElement>('nav a[href="/foro"]')!;

    expect(foro.textContent?.trim()).toBe('Foro');
    expect(foro.getAttribute('href')).toBe('/foro');
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

  it('muestra Administración aparte y el menú de usuario con perfil y favoritos', async () => {
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
    const trigger = element.querySelector<HTMLButtonElement>('.user-menu__trigger')!;

    expect(
      element.querySelector<HTMLAnchorElement>('.session-actions a[href="/admin"]'),
    ).not.toBeNull();
    expect(trigger.getAttribute('aria-label')).toBe('Menú de usuario');
    expect(trigger.getAttribute('aria-controls')).toBe('user-menu-panel');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Sin enlaces directos de cuenta en la fila: todo vive en el desplegable.
    expect(element.querySelector('a[href="/perfil"]')).toBeNull();
    expect(element.querySelector('a[href="/favoritos"]')).toBeNull();
    expect(element.querySelector('button.link-button')).toBeNull();
    expect(
      element.querySelector<HTMLAnchorElement>('.session-actions a[href="/auth/login"]'),
    ).toBeNull();

    trigger.click();
    await fixture.whenStable();
    const panel = element.querySelector<HTMLElement>('#user-menu-panel')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.querySelector('a[href="/perfil"]')?.textContent?.trim()).toBe('Mi perfil');
    expect(panel.querySelector('a[href="/favoritos"]')?.textContent?.trim()).toBe('Mis favoritos');
    expect(panel.querySelector('button')?.textContent?.trim()).toBe('Cerrar sesión');
    expect(panel.querySelector('.user-menu__name')?.textContent?.trim()).toBe('Mi cuenta');
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
    expect(brand.getAttribute('aria-label')).toBe('Academia de Guitarra, ir al inicio');
    expect(brand.textContent?.trim()).toBe('Academia de Guitarra');
    expect(cursos.textContent?.trim()).toBe('Cursos');

    brand.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');

    cursos.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/cursos');
  });

  it('la cabecera solo nombra «Academia de Guitarra»', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector<HTMLElement>('header.site-header')!;
    const brand = element.querySelector<HTMLElement>('.brand')!;

    expect(header.textContent).toContain('Academia de Guitarra');
    expect(header.textContent).not.toContain('De Acordes Gaditanos');
    expect(brand.getAttribute('aria-label')).not.toContain('De Acordes Gaditanos');
    expect(brand.querySelectorAll('span')).toHaveLength(1);
    expect(brand.querySelector('.brand__text')?.textContent?.trim()).toBe('Academia de Guitarra');
    expect(brand.querySelector('.brand__name')).toBeNull();
    expect(brand.querySelector('.brand__sub')).toBeNull();
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
      'Foro',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/cursos',
      '/mis-cursos',
      '/foro',
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

    await goto(fixture, '/foro');
    expect(currents()).toEqual([null, null, 'page']);
    expect(
      element
        .querySelector<HTMLAnchorElement>('nav a[aria-current="page"]')
        ?.getAttribute('href'),
    ).toBe('/foro');
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

  it('mueve el foco al contenido principal sin desplazar el scroll en una navegación explícita', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const main = element.querySelector<HTMLElement>('main')!;
    const skipLink = element.querySelector<HTMLAnchorElement>('.skip-link')!;
    const focus = vi.spyOn(main, 'focus');

    skipLink.focus();
    expect(document.activeElement).toBe(skipLink);

    await goto(fixture, '/foro');

    expect(document.activeElement).toBe(main);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('la marca abre el índice con el foco en main y sin scroll', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const main = element.querySelector<HTMLElement>('main')!;
    const brand = element.querySelector<HTMLAnchorElement>('.brand')!;
    const focus = vi.spyOn(main, 'focus');

    brand.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/');
    expect(document.activeElement).toBe(main);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
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

    panel.querySelector<HTMLAnchorElement>('a[href="/foro"]')!.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/foro');
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
    expect(sessionActions.querySelector('a[href="/favoritos"]')).toBeNull();
    expect(sessionActions.querySelector('.user-menu')).toBeNull();
    expect(sessionActions.querySelector('a[href="/admin"]')).toBeNull();
    expect(sessionActions.textContent).not.toContain('Cerrar sesión');
  });

  it('muestra el menú de cuenta, pero no Administración, para un alumno', async () => {
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
    const userMenu = element.querySelector<HTMLElement>('.user-menu')!;

    expect(element.querySelector<HTMLButtonElement>('.user-menu__trigger')).not.toBeNull();
    // El perfil ya no vive en el overlay: está en la fila de la cabecera.
    expect(sessionActions.contains(userMenu)).toBe(false);
    expect(element.querySelector<HTMLElement>('.site-header__inner')!.contains(userMenu)).toBe(true);
    expect(sessionActions.querySelector('a[href="/admin"]')).toBeNull();
    expect(sessionActions.querySelector('a[href="/auth/login"]')).toBeNull();
    expect(sessionActions.textContent).not.toContain('Cerrar sesión');

    element.querySelector<HTMLButtonElement>('.user-menu__trigger')!.click();
    await fixture.whenStable();
    const panel = element.querySelector<HTMLElement>('#user-menu-panel')!;
    expect(panel.querySelector('a[href="/perfil"]')?.textContent?.trim()).toBe('Mi perfil');
    expect(panel.querySelector('a[href="/favoritos"]')?.textContent?.trim()).toBe('Mis favoritos');
    expect(panel.querySelector('button')?.textContent?.trim()).toBe('Cerrar sesión');
  });

  it('alinea el ancho y el gutter del header con el contenido (.home-inner)', async () => {
    await createShell('/cursos');
    const shell = readFileSync('src/app/app.scss', 'utf8');
    const home = readFileSync('src/app/features/home/home.scss', 'utf8');
    const header = shell.match(/\.site-header__inner\s*\{[^}]*\}/)?.[0] ?? '';
    const content = home.match(/\.home-inner\s*\{[^}]*\}/)?.[0] ?? '';

    expect(header).toContain('max-width:var(--content-max-width)');
    expect(header).toContain('margin-inline:auto');
    expect(header).toContain('padding-inline:clamp(1.25rem, 5vw, 3rem)');
    expect(content).toContain('max-width: var(--content-max-width)');
    expect(content).toContain('padding-inline: clamp(1.25rem, 5vw, 3rem)');
    // Ninguna media query del shell vuelve a achicar el gutter horizontal.
    expect(shell).not.toMatch(/padding-inline:\s*(?:1rem|0\.75rem)/);
  });

  it('declara estilos locales responsive y objetivos táctiles', async () => {
    await createShell('/cursos');
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(css).toContain('nav-toggle');
    expect(css).toContain('nav-toggle__icon--close');
    expect(css).toContain('.nav-toggle.is-open');
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
    const panel = element.querySelector<HTMLElement>('#site-navigation')!;
    const nav = element.querySelector<HTMLElement>(
      'nav[aria-label="Navegación principal"]',
    )!;

    expect(getComputedStyle(toggle).display).toBe('none');
    expect(element.querySelector('.menu-close')).toBeNull();
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

  it('el MISMO botón muestra hamburguesa al cerrar y X visible al abrir', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const menu = toggle.querySelector<SVGElement>('.nav-toggle__icon--menu')!;
    const close = toggle.querySelector<SVGElement>('.nav-toggle__icon--close')!;

    expect(element.querySelectorAll('.nav-toggle')).toHaveLength(1);
    expect(element.querySelector('.menu-close')).toBeNull();
    expect(getComputedStyle(menu).display).not.toBe('none');
    expect(getComputedStyle(close).display).toBe('none');
    expect(toggle.classList.contains('is-open')).toBe(false);

    toggle.click();
    await fixture.whenStable();

    expect(toggle.classList.contains('is-open')).toBe(true);
    expect(getComputedStyle(menu).display).toBe('none');
    expect(getComputedStyle(close).display).toBe('block');
    expect(toggle.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(element.querySelector('[title]')).toBeNull();

    toggle.click();
    await fixture.whenStable();
    expect(getComputedStyle(menu).display).not.toBe('none');
    expect(getComputedStyle(close).display).toBe('none');
  });

  it('el header no cambia de altura ni el burger de tamaño al abrir', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const header = element.querySelector<HTMLElement>('.site-header')!;
    const row = element.querySelector<HTMLElement>('.site-header__inner')!;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const overlay = element.querySelector<HTMLElement>('#site-navigation')!;
    const shell = readFileSync('src/app/app.scss', 'utf8');
    const height = header.getBoundingClientRect().height;
    const before = getComputedStyle(row);
    const padding = [before.paddingTop, before.paddingBottom];
    const minHeight = before.minHeight;
    const size = [getComputedStyle(toggle).minWidth, getComputedStyle(toggle).minHeight];

    toggle.click();
    await fixture.whenStable();

    const after = getComputedStyle(row);
    expect(header.getBoundingClientRect().height).toBe(height);
    expect([after.paddingTop, after.paddingBottom]).toEqual(padding);
    expect(after.minHeight).toBe(minHeight);
    expect([getComputedStyle(toggle).minWidth, getComputedStyle(toggle).minHeight]).toEqual(size);
    expect(toggle.parentElement).toBe(row);
    expect(overlay.contains(toggle)).toBe(false);
    expect(element.querySelectorAll('.nav-toggle')).toHaveLength(1);
    expect(after.alignItems).toBe('center');
    expect(after.flexWrap).toBe('nowrap');
    // El overlay es fijo y no altera el flujo; la fila se pinta por encima (51 > 50).
    expect(shell).toContain('position:fixed;inset:0;z-index:50');
    expect(shell).toContain('z-index:51');
    expect(shell).toContain('flex-wrap:nowrap');
    expect(shell).not.toContain('site-header--menu-open');
    expect(shell).not.toContain('top: 4.5rem');
  });

  it('el X del mismo botón cierra el panel y devuelve el foco al burger', async () => {
    document.body.style.overflow = '';
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const close = toggle.querySelector<SVGElement>('.nav-toggle__icon--close')!;

    toggle.focus();
    toggle.click();
    await fixture.whenStable();
    expect(document.body.style.overflow).toBe('hidden');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(getComputedStyle(close).display).toBe('block');

    toggle.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(toggle.classList.contains('is-open')).toBe(false);
    expect(getComputedStyle(close).display).toBe('none');
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

    await goto(fixture, '/foro');
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
    const userTrigger = element.querySelector<HTMLButtonElement>('.user-menu__trigger')!;

    document.body.style.overflow = '';
    toggle.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    // Los dos disclosures son excluyentes: abrir el perfil cierra el overlay.
    userTrigger.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(fixture.componentInstance.userMenuOpen()).toBe(true);
    const logoutButton = element.querySelector<HTMLButtonElement>('#user-menu-panel button')!;
    logoutButton.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(fixture.componentInstance.userMenuOpen()).toBe(false);
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

describe('App shell · tema único Línea precisa', () => {
  async function createShell(url?: string): Promise<ComponentFixture<App>> {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    if (url) {
      await TestBed.inject(Router).navigateByUrl(url);
    }
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(async () => {
    // index.html fija el tema sin JS; replicamos ese estado inicial en jsdom.
    const index = readFileSync('src/index.html', 'utf8');
    const declared = index.match(/<html[^>]*\bdata-theme="([^"]+)"/)?.[1];
    expect(declared).toBe('linea');
    document.documentElement.dataset['theme'] = declared!;
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(shellRoutes),
        { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '' } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    TestBed.resetTestingModule();
  });

  it('mantiene data-theme="linea" sin selector ni persistencia', async () => {
    const fixture = await createShell('/cursos');
    const element = fixture.nativeElement as HTMLElement;

    expect(document.documentElement.dataset['theme']).toBe('linea');
    expect(element.querySelector('app-theme-selector')).toBeNull();
    expect(element.querySelector('[aria-label="Cambiar tema"]')).toBeNull();
  });

  it('no reintroduce el tema en el aula, donde la cabecera está oculta', async () => {
    const fixture = await createShell(aulaUrl);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('header.site-header')).toBeNull();
    expect(element.querySelector('.user-menu')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBe('linea');
  });
});

describe('App shell · menú de usuario', () => {
  async function createShell(session: unknown): Promise<ComponentFixture<App>> {
    TestBed.overrideProvider(AuthService, {
      useValue: {
        configurationPending: signal(false),
        loading: signal(false),
        session: signal(session),
        isAdmin: signal(false),
        logout: vi.fn().mockResolvedValue({ ok: true }),
      },
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/cursos');
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function triggerOf(element: HTMLElement): HTMLButtonElement {
    const trigger = element.querySelector<HTMLButtonElement>('.user-menu__trigger')!;
    expect(trigger).not.toBeNull();
    return trigger;
  }

  async function open(
    fixture: ComponentFixture<App>,
    element: HTMLElement,
  ): Promise<HTMLButtonElement> {
    const trigger = triggerOf(element);
    trigger.click();
    await fixture.whenStable();
    return trigger;
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

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('abre y cierra el desplegable con aria sin mostrar el correo', async () => {
    const fixture = await createShell({
      user: { id: 'user-1', email: 'no-debe-aparecer@ejemplo.invalid' },
    });
    const element = fixture.nativeElement as HTMLElement;
    const trigger = triggerOf(element);

    expect(trigger.getAttribute('aria-label')).toBe('Menú de usuario');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-controls')).toBe('user-menu-panel');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(element.textContent).not.toContain('no-debe-aparecer@ejemplo.invalid');
    expect(element.querySelector('[title]')?.getAttribute('title') ?? '').not.toContain('@');

    await open(fixture, element);
    const panel = element.querySelector<HTMLElement>('#user-menu-panel')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.textContent).not.toContain('no-debe-aparecer@ejemplo.invalid');
    expect(panel.querySelector('.user-menu__name')?.textContent?.trim()).toBe('Mi cuenta');

    trigger.click();
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('#user-menu-panel')).toBeNull();
  });

  it('ofrece Mi perfil, Mis favoritos y Cerrar sesión como opciones accesibles', async () => {
    const fixture = await createShell({ user: { id: 'user-1' } });
    const element = fixture.nativeElement as HTMLElement;
    await open(fixture, element);

    const panel = element.querySelector<HTMLElement>('#user-menu-panel')!;
    const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'Mi perfil',
      'Mis favoritos',
      'Cerrar sesión',
    ]);
    expect(items.map((item) => item.tagName)).toEqual(['A', 'A', 'BUTTON']);
    expect(items[0].getAttribute('href')).toBe('/perfil');
    expect(items[1].getAttribute('href')).toBe('/favoritos');
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');
    expect(css).toContain('min-height: 44px');
    expect(getComputedStyle(items[0]).minHeight).toBe('44px');
    expect(getComputedStyle(items[1]).minHeight).toBe('44px');
    expect(getComputedStyle(triggerOf(element)).minHeight).toBe('44px');
  });

  it('muestra un nombre seguro del perfil y nunca el correo', async () => {
    const fixture = await createShell({
      user: {
        id: 'user-1',
        email: 'privado@ejemplo.invalid',
        user_metadata: { display_name: 'Paco' },
      },
    });
    const element = fixture.nativeElement as HTMLElement;
    await open(fixture, element);

    const panel = element.querySelector<HTMLElement>('#user-menu-panel')!;
    expect(panel.querySelector('.user-menu__name')?.textContent?.trim()).toBe('Paco');
    expect(element.textContent).not.toContain('privado@ejemplo.invalid');
  });

  it('Escape cierra y devuelve el foco al botón', async () => {
    const fixture = await createShell({ user: { id: 'user-1' } });
    const element = fixture.nativeElement as HTMLElement;
    const trigger = await open(fixture, element);

    const item = element.querySelector<HTMLElement>('#user-menu-panel [role="menuitem"]')!;
    item.focus();
    expect(document.activeElement).toBe(item);
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(element.querySelector('#user-menu-panel')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('un click fuera cierra el desplegable', async () => {
    const fixture = await createShell({ user: { id: 'user-1' } });
    const element = fixture.nativeElement as HTMLElement;
    const trigger = await open(fixture, element);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('#user-menu-panel')).toBeNull();
  });

  it('Cerrar sesión usa el logout real y limpia el estado', async () => {
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
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/cursos');
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    await open(fixture, element);

    element.querySelector<HTMLButtonElement>('#user-menu-panel button')!.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.userMenuOpen()).toBe(false);
    expect(element.querySelector('#user-menu-panel')).toBeNull();
  });

  it('la visita anónima no ve el control ni Mis favoritos', async () => {
    const fixture = await createShell(null);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.user-menu')).toBeNull();
    expect(element.querySelector('a[href="/favoritos"]')).toBeNull();
    expect(element.querySelector('a[href="/perfil"]')).toBeNull();
    expect(element.querySelector('a[href="/auth/login"]')).not.toBeNull();
  });

  it('burger y perfil van sin borde y conservan el aro de foco', async () => {
    const fixture = await createShell({ user: { id: 'user-1' } });
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const trigger = triggerOf(element);
    const shell = readFileSync('src/app/app.scss', 'utf8');
    const controls =
      shell.match(/:is\(\.nav-toggle, \.user-menu__trigger\) \{[^}]*\}/)?.[0] ?? '';
    const panel = shell.match(/\.user-menu__panel \{[^}]*\}/)?.[0] ?? '';

    expect(controls).toContain('border:0');
    expect(controls).toContain('background:transparent');
    expect(controls).not.toMatch(/border:\s*1px/);
    // El borde decorativo sigue solo en el desplegable, no en los iconos.
    expect(panel).toContain('border:1px solid var(--border)');
    expect(shell).toContain(':focus-visible');
    expect(shell).toContain('outline:3px solid var(--focus)');
    expect(getComputedStyle(toggle).borderTopWidth).toBe('0px');
    expect(getComputedStyle(trigger).borderTopWidth).toBe('0px');
    expect(getComputedStyle(toggle).minHeight).toBe('44px');
    expect(getComputedStyle(trigger).minHeight).toBe('44px');
  });

  it('el burger de móvil es solo icono y conserva su nombre accesible', async () => {
    const fixture = await createShell({ user: { id: 'user-1' } });
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;

    expect(element.querySelector('.nav-toggle__label')).toBeNull();
    expect(toggle.textContent?.trim()).toBe('');
    expect(element.querySelector('.site-header')?.textContent).not.toContain('Menú');
    expect(toggle.querySelectorAll('svg')).toHaveLength(2);
    expect(toggle.querySelector('.nav-toggle__icon--menu')).not.toBeNull();
    expect(toggle.querySelector('.nav-toggle__icon--close')).not.toBeNull();
    expect(toggle.getAttribute('aria-label')).toBe('Abrir menú');
    expect(toggle.getAttribute('aria-controls')).toBe('site-navigation');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(getComputedStyle(toggle).minWidth).toBe('44px');
    expect(getComputedStyle(toggle).minHeight).toBe('44px');

    // Abrir el perfil no abre el burger; abrir el burger cierra el perfil.
    await open(fixture, element);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(element.querySelector('#user-menu-panel')).toBeNull();
  });

  it('el perfil va en la fila de la cabecera junto al burger, fuera del overlay', async () => {
    const fixture = await createShell({
      user: { id: 'user-1', email: 'privado@ejemplo.invalid' },
    });
    const element = fixture.nativeElement as HTMLElement;
    const inner = element.querySelector<HTMLElement>('.site-header__inner')!;
    const overlay = element.querySelector<HTMLElement>('#site-navigation')!;
    const toggle = element.querySelector<HTMLButtonElement>('.nav-toggle')!;
    const userMenu = element.querySelector<HTMLElement>('.user-menu')!;
    const trigger = element.querySelector<HTMLButtonElement>('.user-menu__trigger')!;

    expect(inner.contains(userMenu)).toBe(true);
    expect(overlay.contains(userMenu)).toBe(false);
    // En móvil el perfil precede al burger en el marcado y en el eje visual.
    expect(userMenu.nextElementSibling).toBe(toggle);
    expect(
      userMenu.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(getComputedStyle(trigger).display).not.toBe('none');
    expect(trigger.getAttribute('aria-label')).toBe('Menú de usuario');
    expect(trigger.getAttribute('aria-controls')).toBe('user-menu-panel');
    expect(element.querySelectorAll('.user-menu__trigger')).toHaveLength(1);
    expect(element.textContent).not.toContain('privado@ejemplo.invalid');
    expect(element.querySelector('.brand')?.textContent).toContain('Academia de Guitarra');

    await open(fixture, element);
    expect(element.querySelectorAll('#user-menu-panel')).toHaveLength(1);
    expect(inner.contains(element.querySelector('#user-menu-panel'))).toBe(true);
  });

  it('el order solo reordena en escritorio, con el perfil a la derecha', async () => {
    await createShell({ user: { id: 'user-1' } });
    const shell = readFileSync('src/app/app.scss', 'utf8');
    const desktop = shell.match(/@media \(min-width:48rem\) \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(desktop).toContain('.site-header__tools { order:1;}');
    expect(desktop).toContain('.user-menu { order:2;}');
    expect(shell).not.toMatch(/^\s*order:\s*\d/m);
  });

  it('sin sesión no hay icono de perfil y «Iniciar sesión» sigue en el overlay', async () => {
    const fixture = await createShell(null);
    const element = fixture.nativeElement as HTMLElement;
    const overlay = element.querySelector<HTMLElement>('#site-navigation')!;

    expect(element.querySelector('.user-menu')).toBeNull();
    expect(element.querySelector('.user-menu__trigger')).toBeNull();
    expect(
      overlay.querySelector<HTMLAnchorElement>('a[href="/auth/login"]')?.textContent?.trim(),
    ).toBe('Iniciar sesión');
  });

  it('declara un desplegable absoluto y acotado, sin desbordes en móvil', async () => {
    const fixture = await createShell({ user: { id: 'user-1' } });
    const element = fixture.nativeElement as HTMLElement;
    await open(fixture, element);
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');
    const panel = element.querySelector<HTMLElement>('#user-menu-panel')!;

    const shell = readFileSync('src/app/app.scss', 'utf8');
    expect(css).toContain('.user-menu__panel');
    expect(css).toContain('max-width: 47.99rem');
    expect(getComputedStyle(panel).position).toBe('absolute');
    // El compilador simplifica calc() dentro de min(): se verifica en la fuente.
    expect(shell).toContain('max-width:min(18rem, calc(100vw - 2rem))');
    expect(shell).not.toContain('position: static');
  });
});

describe('Acciones sin subrayado declarado (estilos globales y del shell)', () => {
  it('ni los estilos globales ni los del shell subrayan botones o enlaces de acción', () => {
    const global = readFileSync('src/styles.scss', 'utf8');
    const shell = readFileSync('src/app/app.scss', 'utf8');

    for (const css of [global, shell]) {
      expect(css).not.toMatch(/text-decoration\s*:\s*underline/i);
    }
    // El botón enlace y los controles del shell siguen siendo acciones sin
    // subrayado, con el foco resuelto por outline y el token --focus.
    expect(global).toMatch(/\.link-button\s*\{[^}]*text-decoration:\s*none/);
    expect(global).toContain(':focus-visible');
    expect(global).toContain('--focus');
    expect(shell).toContain('text-decoration:none');
    expect(shell).toContain(':focus-visible');
  });

  it('mantiene el SCSS del shell por debajo de 4 kB', () => {
    // El archivo es ASCII: caracteres = bytes.
    const bytes = readFileSync('src/app/app.scss', 'utf8').length;
    expect(bytes).toBeLessThan(4096);
  });
});
