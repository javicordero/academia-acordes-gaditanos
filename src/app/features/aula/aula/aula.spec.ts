import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { AulaData, AulaRepository } from '../aula-repository';
import { AULA_ROUTES } from '../aula.routes';
import { Aula } from './aula';

const lesson = { id: 'l', section_id: 's', slug: 'uno', title: 'Lección', summary: null, content_md: '<script>texto</script>' };
const data: AulaData = { course: { id: 'c', title: 'Curso' }, lesson, sections: [{id: 's', title: 'Bloque'}], lessons: [lesson], canTrack: true, completed: false };
const firstLesson = { ...lesson, id: 'l1', slug: 'uno' };
const secondLesson = { ...lesson, id: 'l2', slug: 'dos' };
const twoLessons: AulaData = {
  course: { id: 'c', title: 'Curso' },
  lesson: firstLesson,
  sections: [{ id: 's', title: 'Bloque' }],
  lessons: [firstLesson, secondLesson],
  canTrack: true,
  completed: false,
};

describe('Aula', () => {
  function setup(load: ReturnType<typeof vi.fn>, save = vi.fn().mockResolvedValue(undefined), user = true) {
    const status = signal(user ? 'authenticated' : 'anonymous');
    const session = signal(user ? { user: { id: 'u' } } : null);
    const error = signal<string | null>(null);
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'aula', children: AULA_ROUTES }]),
      { provide: AuthService, useValue: { status, session, error } },
      { provide: AulaRepository, useValue: { load, save } },
    ] });
    return { save, session, status, error };
  }

  it('muestra texto escapado y guarda progreso manual', async () => {
    const { save } = setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('script')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('<script>texto</script>');
    expect(harness.routeNativeElement?.querySelector('h1')?.getAttribute('tabindex')).toBe('-1');
    await component.toggleProgress();
    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(component.data()?.completed).toBe(true);
  });

  it('no permite progreso anónimo y muestra error al fallar el guardado', async () => {
    const { save } = setup(vi.fn().mockResolvedValue({...data, canTrack: false}), vi.fn(), false);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    await component.toggleProgress();
    expect(save).not.toHaveBeenCalled();
  });

  it('descarta una respuesta de ruta anterior', async () => {
    let resolve!: (value: AulaData) => void;
    const first = new Promise<AulaData>(r => resolve = r);
    setup(vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({...data, lesson: {...lesson, id: 'otro', slug: 'dos'}}));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    const component = await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable();
    resolve(data);
    await Promise.resolve();
    expect(component.data()?.lesson.id).toBe('otro');
  });

  it('conserva el estado al fallar el guardado', async () => {
    setup(vi.fn().mockResolvedValue(data), vi.fn().mockRejectedValue(new Error()));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    await component.toggleProgress();
    expect(component.saveError()).toBe(true);
    expect(component.data()?.completed).toBe(false);
  });

  it('enfoca el encabezado al cargar y tras navegar con Siguiente', async () => {
    setup(vi.fn((course: string, lessonSlug: string) =>
      Promise.resolve({ ...twoLessons, lesson: lessonSlug === 'dos' ? secondLesson : firstLesson }),
    ));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.activeElement?.textContent).toBe('Aula');

    const next = Array.from(harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
      .find((a) => a.textContent?.startsWith('Siguiente:'));
    expect(next?.getAttribute('href')).toBe('/aula/curso/dos');

    next!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.activeElement?.textContent).toBe('Aula');
    expect(harness.routeNativeElement?.textContent).not.toContain('Siguiente:');
  });

  it('no roba el foco al marcar el progreso manual', async () => {
    const { save } = setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const button = harness.routeNativeElement?.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    expect(document.activeElement).toBe(button);

    button.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(document.activeElement).toBe(button);
  });

  it('un TOKEN_REFRESHED del mismo usuario conserva datos, progreso y foco', async () => {
    let resolveSave!: () => void;
    const save = vi.fn(() => new Promise<void>((r) => { resolveSave = r; }));
    const load = vi.fn().mockResolvedValue(data);
    const { session } = setup(load, save);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const button = harness.routeNativeElement?.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    expect(document.activeElement?.tagName).toBe('BUTTON');

    // Guardado en curso + Session nueva con el mismo user.id (token refrescado).
    button.click();
    expect(component.saving()).toBe(true);
    session.set({ user: { id: 'u' } });
    harness.detectChanges();

    expect(load).toHaveBeenCalledTimes(1); // no recarga ni reevalúa RLS
    expect(component.data()?.completed).toBe(false); // el guardado sigue en curso
    expect(document.activeElement?.tagName).toBe('BUTTON'); // foco intacto

    resolveSave();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.data()?.completed).toBe(true); // no se descarta por el refresco
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('logout y cambio de usuario retiran el contenido previo y reevalúan el acceso', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...data, lesson: { ...lesson, id: 'otro', slug: 'dos' } });
    const { session, status } = setup(load);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.data()?.lesson.id).toBe('l');

    // Logout: se retira de inmediato el contenido del usuario anterior y se
    // consulta sin id para que RLS decida qué sigue siendo visible.
    status.set('anonymous');
    session.set(null);
    harness.detectChanges();
    expect(component.data()).toBeNull();
    expect(load).toHaveBeenLastCalledWith('curso', 'uno', null);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.state()).toBe('denied');

    // Otro usuario en la misma ruta: nueva evaluación con su identidad.
    status.set('authenticated');
    session.set({ user: { id: 'u2' } });
    harness.detectChanges();
    expect(load).toHaveBeenLastCalledWith('curso', 'uno', 'u2');
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(load).toHaveBeenCalledTimes(3);
    expect(component.data()?.lesson.id).toBe('otro');
  });

  it('el reintento manual fuerza una recarga aunque no cambie la clave', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce(data);
    setup(load);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.state()).toBe('error');
    expect(load).toHaveBeenCalledTimes(1);

    component.retry();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(load).toHaveBeenCalledTimes(2);
    expect(component.state()).toBe('ready');
  });

  it('no roba el foco una respuesta obsoleta de la lección anterior', async () => {
    let resolveFirst!: (value: AulaData) => void;
    const first = new Promise<AulaData>((r) => (resolveFirst = r));
    setup(vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ...data, lesson: { ...lesson, id: 'otro', slug: 'dos' } }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    const component = await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(document.activeElement?.textContent).toBe('Aula');

    harness.routeNativeElement?.querySelector<HTMLButtonElement>('button')!.focus();
    expect(document.activeElement?.tagName).toBe('BUTTON');

    resolveFirst(data);
    await Promise.resolve();
    harness.detectChanges();

    expect(component.data()?.lesson.id).toBe('otro');
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });
});
