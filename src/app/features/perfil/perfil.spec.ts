import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFileSync } from 'node:fs';
import { AuthService } from '../../core/auth/auth.service';
import { Perfil } from './perfil';
import { PerfilRepository } from './perfil-repository';

describe('Perfil', () => {
  const session = signal<{ user: { id: string; email: string } } | null>(null);
  const status = signal('loading');
  const load = vi.fn();
  const save = vi.fn();
  const user = (id: string) => ({ user: { id, email: 'alumno@example.invalid' } });

  async function setup() {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { session, status } },
      { provide: PerfilRepository, useValue: { load, save } },
    ] });
    const fixture = TestBed.createComponent(Perfil);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    session.set(null); status.set('loading');
    load.mockReset(); save.mockReset();
    load.mockResolvedValue('Nombre');
    save.mockImplementation((_id, value) => Promise.resolve(value));
  });

  it('espera auth y muestra el correo y nombre propios', async () => {
    const fixture = await setup();
    expect(load).not.toHaveBeenCalled();
    session.set(user('u1')); status.set('authenticated');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(load).toHaveBeenCalledWith('u1');
    expect(fixture.nativeElement.textContent).toContain('alumno@example.invalid');
    expect(fixture.componentInstance.name()).toBe('Nombre');
  });

  it('recorta, permite borrar y limita a 60 caracteres Unicode', async () => {
    session.set(user('u1')); status.set('authenticated');
    const fixture = await setup();
    const component = fixture.componentInstance;
    component.name.set('  Nombre  ');
    await component.save();
    expect(save).toHaveBeenCalledWith('u1', 'Nombre');
    component.name.set('  ');
    await component.save();
    expect(save).toHaveBeenCalledWith('u1', null);
    component.name.set('a'.repeat(61));
    await component.save();
    expect(save).toHaveBeenCalledTimes(2);
    expect(component.message()).toContain('60');
  });

  it('informa el error de guardado sin afirmar éxito', async () => {
    session.set(user('u1')); status.set('authenticated');
    save.mockRejectedValue(new Error());
    const fixture = await setup();
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.message()).toContain('No se pudo guardar');
  });

  it('muestra los estados de configuración y error de carga', async () => {
    status.set('unconfigured');
    const fixture = await setup();
    expect(fixture.nativeElement.textContent).toContain('no está configurada');
    load.mockRejectedValueOnce(new Error());
    session.set(user('u1')); status.set('authenticated');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar');
    fixture.componentInstance.retry();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.name()).toBe('Nombre');
  });

  it('ofrece Cambiar contraseña como enlace interno con sesión activa', async () => {
    session.set(user('u1')); status.set('authenticated');
    const fixture = await setup();
    const root = fixture.nativeElement as HTMLElement;
    const link = root.querySelector<HTMLAnchorElement>('a[href="/auth/actualizar-contrasena"]');

    expect(link).not.toBeNull();
    expect(link?.tagName).toBe('A');
    expect(link?.textContent?.trim()).toBe('Cambiar contraseña');
    expect(link?.getAttribute('href')).toBe('/auth/actualizar-contrasena');
    expect(link?.getAttribute('target')).toBeNull();
    expect(link?.tabIndex).toBe(0);
    expect(link?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('no muestra el enlace de cambio sin sesión activa', async () => {
    session.set(null); status.set('anonymous');
    const fixture = await setup();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('a[href="/auth/actualizar-contrasena"]')).toBeNull();
    expect(root.textContent).not.toContain('Cambiar contraseña');
  });

  it('conserva la recuperación por correo y el nombre visible con sus mensajes', async () => {
    const fixture = await setup();
    session.set(user('u1')); status.set('authenticated');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('a[href="/auth/recuperar"]')?.textContent?.trim())
      .toBe('Recuperar o cambiar contraseña');
    expect(root.querySelector('#display-name')).not.toBeNull();
    expect(root.querySelector('#name-message')).not.toBeNull();
  });

  it('descarta carga y guardado antiguos al cambiar o cerrar sesión', async () => {
    let resolveLoad!: (value: string) => void;
    load.mockReturnValueOnce(new Promise<string>(resolve => { resolveLoad = resolve; }));
    const fixture = await setup();
    session.set(user('u1')); status.set('authenticated');
    fixture.detectChanges();
    session.set(user('u2'));
    fixture.detectChanges(); await fixture.whenStable();
    resolveLoad('Antiguo'); await Promise.resolve();
    expect(fixture.componentInstance.name()).toBe('Nombre');
    let resolveSave!: (value: string) => void;
    save.mockReturnValueOnce(new Promise<string>(resolve => { resolveSave = resolve; }));
    void fixture.componentInstance.save();
    session.set(null); status.set('anonymous');
    fixture.detectChanges();
    resolveSave('Antiguo'); await Promise.resolve();
    expect(fixture.componentInstance.name()).toBe('');
    expect(fixture.componentInstance.message()).toBe('');
  });

  it('separa las secciones del perfil con padding y línea fina, sin caja', () => {
    const styles = readFileSync('src/app/features/perfil/perfil.scss', 'utf8');
    const card = styles.match(/\.card\s*\{[^}]*\}/)?.[0] ?? '';
    expect(card).toContain('padding-block: var(--section-gap)');
    expect(card).toContain('border-top: var(--border-width) solid var(--border)');
    expect(card).not.toContain('background');
    expect(card).not.toContain('border-radius');
  });
});
