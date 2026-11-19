import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/auth/auth.service';
import { LessonFavorite } from './lesson-favorite';
import { FavoritesPage } from './favoritos';
import { LessonFavoritesRepository } from './repository';

const COURSE_UUID = '11111111-1111-1111-1111-111111111111';
const OTHER_COURSE_UUID = '22222222-2222-2222-2222-222222222222';
const SECTION_UUID = '33333333-3333-3333-3333-333333333333';

function favorite(overrides: Partial<LessonFavorite> = {}): LessonFavorite {
  return {
    lessonId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    lessonSlug: 'rasgueo',
    lessonTitle: 'Rasgueo',
    courseId: COURSE_UUID,
    courseSlug: 'pasodoble',
    courseTitle: 'Pasodoble',
    sectionId: SECTION_UUID,
    sectionTitle: 'Mano derecha',
    position: 0,
    createdAt: '2026-11-18T10:00:00Z',
    ...overrides,
  };
}

function setup(options: {
  list?: () => Promise<readonly LessonFavorite[]>;
  status?: ReturnType<typeof signal<string>>;
  session?: ReturnType<typeof signal<{ user: { id: string } }>>;
} = {}) {
  const status = options.status ?? signal('authenticated');
  const session = options.session ?? signal({ user: { id: 'u' } });
  const list = options.list ?? vi.fn().mockResolvedValue([]);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { status, session } },
      { provide: LessonFavoritesRepository, useValue: { list, toggle: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(FavoritesPage);
  return { fixture, status, session, list, root: () => fixture.nativeElement as HTMLElement };
}

async function render(fixture: ReturnType<typeof setup>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Mis favoritos', () => {
  it('muestra el título y un esqueleto accesible mientras carga', async () => {
    let resolve!: (rows: readonly LessonFavorite[]) => void;
    const list = vi.fn().mockReturnValue(new Promise<readonly LessonFavorite[]>((r) => { resolve = r; }));
    const { fixture, root } = setup({ list });

    fixture.detectChanges();
    const element = root();
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Mis favoritos');
    expect(element.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('list');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Cargando tus favoritos');
    expect(element.querySelector('article')?.getAttribute('aria-busy')).toBe('true');

    resolve([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('app-skeleton')).toBeNull();
  });

  it('agrupa por curso, ordena por posición y enlaza cada lección con el aula', async () => {
    const rows = [
      favorite({ lessonId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', lessonSlug: 'tarde', lessonTitle: 'La tarde', position: 2 }),
      favorite({ lessonId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', lessonSlug: 'temprano', lessonTitle: 'Temprano', position: 1 }),
      favorite({
        lessonId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', lessonSlug: 'cuples', lessonTitle: 'Cuplés',
        courseId: OTHER_COURSE_UUID, courseSlug: 'cuples', courseTitle: 'Cuplés', position: 0,
      }),
    ];
    const { fixture, root } = setup({ list: vi.fn().mockResolvedValue(rows) });
    await render(fixture);

    const element = root();
    const courses = [...element.querySelectorAll<HTMLElement>('.favorites__course')];
    expect(courses.map((course) => course.querySelector('h2')?.textContent?.trim())).toEqual(['Pasodoble', 'Cuplés']);
    expect([...courses[0].querySelectorAll('.favorites__lesson-title')].map((node) => node.textContent))
      .toEqual(['Temprano', 'La tarde']);
    expect([...element.querySelectorAll('a[href^="/aula/"]')].map((a) => a.getAttribute('href'))).toEqual([
      '/aula/pasodoble/temprano',
      '/aula/pasodoble/tarde',
      '/aula/cuples/cuples',
    ]);
    expect(element.textContent).toContain('Mano derecha');
  });

  it('muestra el estado vacío con salida al catálogo', async () => {
    const { fixture, root } = setup({ list: vi.fn().mockResolvedValue([]) });
    await render(fixture);

    expect(root().textContent).toContain('Todavía no has guardado ninguna lección');
    expect(root().querySelector('a[href="/cursos"]')).not.toBeNull();
  });

  it('muestra error accesible y reintenta sin duplicar peticiones', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('fallo de red'))
      .mockResolvedValueOnce([favorite()]);
    const { fixture, root } = setup({ list });
    await render(fixture);

    const element = root();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se han podido cargar tus favoritos');
    const retry = element.querySelector<HTMLButtonElement>('.favorites__notice--alert button')!;
    expect(retry.textContent?.trim()).toBe('Reintentar');
    expect(element.textContent).not.toContain('fallo de red');

    retry.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(list).toHaveBeenCalledTimes(2);
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.querySelector('a[href="/aula/pasodoble/rasgueo"]')).not.toBeNull();
  });

  it('descarta una respuesta tardía de otra cuenta y limpia los datos al cerrar sesión', async () => {
    const status = signal('authenticated');
    const session = signal({ user: { id: 'a' } });
    let resolveOld!: (rows: readonly LessonFavorite[]) => void;
    const list = vi.fn((id?: string) => id === undefined && session().user.id === 'a'
      ? new Promise<readonly LessonFavorite[]>((r) => { resolveOld = r; })
      : Promise.resolve([]));
    const { fixture, root } = setup({ list, status, session });
    fixture.detectChanges();

    session.set({ user: { id: 'b' } });
    fixture.detectChanges();
    await fixture.whenStable();
    resolveOld([favorite({ lessonTitle: 'Privado anterior' })]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root().textContent).not.toContain('Privado anterior');
    expect(root().textContent).toContain('Todavía no has guardado ninguna lección');

    status.set('anonymous');
    fixture.detectChanges();
    expect(root().textContent).toContain('Inicia sesión para consultar tus favoritos');
  });
});
