import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Library, LibraryCourse, LibraryProblem, MisCursosRepository } from './mis-cursos-repository';
import { MisCursos } from './mis-cursos';

const card = (id: string, extra: Partial<LibraryCourse> = {}): LibraryCourse => ({
  id,
  slug: id,
  title: `Curso ${id}`,
  summary: null,
  level: 'basico',
  total: 2,
  completed: 1,
  percent: 50,
  resume: 'leccion',
  ...extra,
});
const library = (courses: LibraryCourse[], problems: LibraryProblem[] = [], unavailable = 0): Library =>
  ({ courses, problems, unavailable });

function setup(options: {
  load?: any;
  status?: any;
  session?: any;
} = {}) {
  const status = options.status ?? signal('authenticated');
  const session = options.session ?? signal({ user: { id: 'u' } });
  const load = options.load ?? vi.fn().mockResolvedValue(library([card('c')]));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: AuthService, useValue: { status, session } },
    { provide: MisCursosRepository, useValue: { load } },
  ] });
  const fixture = TestBed.createComponent(MisCursos);
  return { fixture, status, session, load, text: () => fixture.nativeElement.textContent as string };
}

async function render(fixture: ReturnType<typeof setup>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('MisCursos', () => {
  it('muestra tarjetas con progreso accesible y enlaces de curso y aula', async () => {
    const { fixture, text } = setup({ load: vi.fn().mockResolvedValue(library([card('c', { summary: 'Resumen' })])) });
    await render(fixture);

    expect(text()).toContain('1/2 lecciones completadas (50 %)');
    expect((fixture.nativeElement as HTMLElement).querySelector('progress')?.getAttribute('aria-label')).toBe('Progreso de Curso c');
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/aula/c/leccion"]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/cursos/c"]')).not.toBeNull();
  });

  it('muestra carga, vacío y login, y descarta una respuesta tardía de otra cuenta', async () => {
    const status = signal('authenticated');
    const session = signal<{ user: { id: string } }>({ user: { id: 'a' } });
    let resolveA!: (value: Library) => void;
    const load = vi.fn((id: string) => id === 'a'
      ? new Promise<Library>((resolve) => { resolveA = resolve; })
      : Promise.resolve(library([])));
    const { fixture, text } = setup({ status, session, load });

    fixture.detectChanges();
    expect(text()).toContain('Cargando tus cursos');

    session.set({ user: { id: 'b' } });
    fixture.detectChanges();
    await fixture.whenStable();
    resolveA(library([card('old', { title: 'Privado anterior' })]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('No tienes cursos disponibles');
    expect(text()).not.toContain('Privado anterior');

    status.set('anonymous');
    session.set(null as unknown as { user: { id: string } });
    fixture.detectChanges();
    expect(text()).toContain('Inicia sesión');
    expect(text()).not.toContain('Privado anterior');
  });

  it('un TOKEN_REFRESHED con el mismo usuario no repite consultas ni pierde la biblioteca', async () => {
    const session = signal({ user: { id: 'a' }, access_token: 'inicial' });
    const load = vi.fn().mockResolvedValue(library([card('c')]));
    const { fixture, text } = setup({ session, load });
    await render(fixture);
    expect(load).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Curso c');

    session.set({ user: { id: 'a' }, access_token: 'refrescado' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Curso c');
    expect(text()).not.toContain('Cargando tus cursos');
  });

  it('un error global muestra aviso honesto y su reintento recupera la biblioteca', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('load'))
      .mockResolvedValueOnce(library([card('c')]));
    const { fixture, text } = setup({ load });
    await render(fixture);

    expect(text()).toContain('No se han podido cargar tus cursos');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();

    const button = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"] ~ button, button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Curso c');
    expect(text()).not.toContain('No se han podido cargar tus cursos');
  });

  it('un fallo parcial conserva la tarjeta válida y reintenta solo los fallidos sin duplicar', async () => {
    const good = card('a');
    const problems: LibraryProblem[] = [
      { courseId: 'hidden', kind: 'unavailable' },
      { courseId: 'b', kind: 'failed' },
    ];
    let retryPayload: unknown = null;
    const load = vi.fn()
      .mockResolvedValueOnce(library([good], problems, 1))
      .mockImplementationOnce((_userId: string, retry?: unknown) => {
        retryPayload = retry;
        return Promise.resolve(library([good, card('b')], [problems[0]], 1));
      });
    const { fixture, text } = setup({ load });
    await render(fixture);

    expect(text()).toContain('Curso a');
    expect(text()).toContain('No se pudieron cargar 1 curso');
    expect(text()).toContain('no están disponibles');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('Reintentar cursos con fallo'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(retryPayload).toMatchObject({
      courses: [good],
      problems,
    });
    expect(text()).toContain('Curso b');
    expect(text()).not.toContain('No se pudieron cargar');
    expect(text()).toContain('no están disponibles');

    const titles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2'))
      .map((node: Element) => node.textContent);
    expect(titles.filter((title) => title === 'Curso a')).toHaveLength(1);
    expect(titles.filter((title) => title === 'Curso b')).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button')).toHaveLength(0);
  });

  it('un reintento parcial que vuelve a fallar mantiene la tarjeta válida sin bucle', async () => {
    const problems: LibraryProblem[] = [{ courseId: 'b', kind: 'failed' }];
    const load = vi.fn()
      .mockResolvedValueOnce(library([card('a')], problems))
      .mockResolvedValueOnce(library([card('a')], problems));
    const { fixture, text } = setup({ load });
    await render(fixture);

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('Reintentar cursos con fallo'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Curso a');
    expect(text()).toContain('No se pudieron cargar 1 curso');
    expect(load.mock.calls[1][1]).toMatchObject({ courses: [card('a')], problems });
  });

  it('cambiar de cuenta descarta tarjetas privadas y problems de la identidad anterior', async () => {
    const session = signal<{ user: { id: string } }>({ user: { id: 'a' } });
    const load = vi.fn((id: string) => Promise.resolve(id === 'a'
      ? library([card('old', { title: 'Privado anterior' })], [{ courseId: 'old', kind: 'failed' }])
      : library([card('new', { title: 'Nuevo curso' })])));
    const { fixture, text } = setup({ session, load });
    await render(fixture);
    expect(text()).toContain('Privado anterior');

    session.set({ user: { id: 'b' } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Nuevo curso');
    expect(text()).not.toContain('Privado anterior');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button')).toHaveLength(0);
  });
});
