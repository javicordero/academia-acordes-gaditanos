import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { MisCursosRepository } from './mis-cursos-repository';
import { MisCursos } from './mis-cursos';

describe('MisCursos', () => {
  it('muestra tarjetas con progreso accesible y enlaces de curso y aula', async () => {
    TestBed.configureTestingModule({providers: [
      provideRouter([]),
      {provide: AuthService, useValue: {status: signal('authenticated'), session: signal({user: {id: 'u'}})}},
      {provide: MisCursosRepository, useValue: {load: () => Promise.resolve({unavailable: 0, courses: [
        {id: 'c', slug: 'curso', title: 'Curso', summary: 'Resumen', level: 'basico', total: 2, completed: 1, percent: 50, resume: 'leccion'},
      ]})}},
    ]});
    const fixture = TestBed.createComponent(MisCursos);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1/2 lecciones completadas (50 %)');
    expect(fixture.nativeElement.querySelector('progress').getAttribute('aria-label')).toBe('Progreso de Curso');
    expect(fixture.nativeElement.querySelector('a[href="/aula/curso/leccion"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/cursos/curso"]')).not.toBeNull();
  });
  it('muestra carga, vacío y descarta respuestas de otra sesión', async () => {
    const status = signal('authenticated');
    const session = signal<any>({user: {id: 'a'}});
    let resolveA!: (value: unknown) => void;
    const load = vi.fn((id: string) => id === 'a' ? new Promise(resolve => resolveA = resolve) : Promise.resolve({courses: [], unavailable: 0}));
    TestBed.configureTestingModule({providers: [provideRouter([]), {provide: AuthService, useValue: {status, session}}, {provide: MisCursosRepository, useValue: {load}}]});
    const fixture = TestBed.createComponent(MisCursos);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cargando tus cursos');
    session.set({user: {id: 'b'}});
    fixture.detectChanges();
    resolveA({courses: [{id: 'old', title: 'Privado anterior'}], unavailable: 0});
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No tienes cursos disponibles');
    expect(fixture.nativeElement.textContent).not.toContain('Privado anterior');
    status.set('anonymous');
    session.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Inicia sesión');
  });
  it('un TOKEN_REFRESHED con el mismo usuario no repite consultas ni pierde la biblioteca', async () => {
    const session = signal<any>({user: {id: 'a'}, access_token: 'inicial'});
    const load = vi.fn(() => Promise.resolve({unavailable: 0, courses: [
      {id: 'c', slug: 'curso', title: 'Curso', summary: null, level: 'basico', total: 2, completed: 1, percent: 50, resume: 'leccion'},
    ]}));
    TestBed.configureTestingModule({providers: [
      provideRouter([]),
      {provide: AuthService, useValue: {status: signal('authenticated'), session}},
      {provide: MisCursosRepository, useValue: {load}},
    ]});
    const fixture = TestBed.createComponent(MisCursos);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('1/2 lecciones completadas (50 %)');

    // Supabase emite un objeto Session nuevo (mismo user.id) en TOKEN_REFRESHED.
    session.set({user: {id: 'a'}, access_token: 'refrescado'});
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('1/2 lecciones completadas (50 %)');
    expect(fixture.nativeElement.textContent).not.toContain('Cargando tus cursos');
  });
});
