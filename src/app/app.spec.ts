import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
