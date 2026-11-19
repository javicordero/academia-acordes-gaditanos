import { readFileSync } from 'node:fs';
import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Admin } from './admin';
import { Course, CoursesRepository } from './courses-repository';
import { CourseEditor } from './course-editor/course-editor';
import { LessonMaterials } from './lesson-materials/lesson-materials';
import { LessonVideo } from './lesson-video/lesson-video';
import { Lesson, StructureRepository } from './structure-repository';
import { Structure } from './structure/structure';

@Component({ selector: 'app-structure', template: '<h2>Estructura</h2>' })
class StructureStub {
  readonly course = input.required<Course>();
  readonly closed = output<void>();
}

@Component({ selector: 'app-lesson-video', template: '<h3>Vídeo de prueba</h3>' })
class LessonVideoStub {
  readonly courseId = input('');
  readonly lessonId = input('');
  readonly lessonTitle = input('');
}

@Component({ selector: 'app-lesson-materials', template: '<h3>Materiales de prueba</h3>' })
class LessonMaterialsStub {
  readonly courseId = input.required<string>();
  readonly lessonId = input.required<string>();
  readonly lessonTitle = input.required<string>();
  readonly closed = output<void>();
}

@Component({ selector: 'app-admin-preview', template: '<h1>Vista previa del aula</h1>' })
class PreviewStub {}

const course: Course = {
  id: 'c1', slug: 'curso-uno', title: 'Curso uno', summary: null, description: null,
  level: 'basico', status: 'draft', sort_order: 0, published_at: null,
};

const lesson: Lesson = {
  id: 'l1', course_id: 'c1', section_id: 's1', slug: 'leccion-uno', title: 'Lección uno',
  summary: 'Resumen interno', content_md: 'Descripción larga de uso interno', position: 0,
  duration_seconds: null, is_free_preview: false, is_published: false, content_type: 'video',
};

const routes: Routes = [
  {
    path: 'admin',
    component: Admin,
    children: [
      { path: '', pathMatch: 'full', data: { section: 'cursos' }, children: [] },
      { path: 'nuevo', data: { section: 'nuevo' }, children: [] },
      {
        path: 'curso/:courseId',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'datos' },
          { path: 'datos', data: { section: 'datos' }, children: [] },
          { path: 'estructura', data: { section: 'estructura' }, children: [] },
          { path: 'leccion/:lessonId', data: { section: 'leccion' }, children: [] },
          { path: 'vista-previa/:lessonId', component: PreviewStub, data: { section: 'vista-previa' } },
          { path: 'vista-previa', component: PreviewStub, data: { section: 'vista-previa' } },
          { path: 'estado', data: { section: 'estado' }, children: [] },
        ],
      },
      { path: 'vista-previa/:courseId/:lessonId', component: PreviewStub, data: { section: 'vista-previa' } },
      { path: 'vista-previa/:courseId', component: PreviewStub, data: { section: 'vista-previa' } },
      { path: ':courseId/:lessonId/video', data: { section: 'leccion' }, children: [] },
    ],
  },
];

function setup(
  list = vi.fn().mockResolvedValue([course]),
  structureList = vi.fn().mockResolvedValue({ sections: [], lessons: [lesson] }),
  session = signal<{ user: { id: string } } | null>({ user: { id: 'admin' } }),
): void {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: CoursesRepository, useValue: { list, save: vi.fn() } },
      { provide: StructureRepository, useValue: { list: structureList } },
      { provide: AuthService, useValue: { session } },
    ],
  });
  // El editor de cursos real se mantiene; los componentes tocados por otros
  // agentes se sustituyen por stubs con el mismo selector.
  TestBed.overrideComponent(Admin, {
    remove: { imports: [Structure, LessonVideo, LessonMaterials] },
    add: { imports: [StructureStub, LessonVideoStub, LessonMaterialsStub] },
  });
}

function adminFrom(harness: RouterTestingHarness): Admin {
  return harness.fixture.debugElement.query(By.directive(Admin)).componentInstance as Admin;
}

describe('Administración de cursos', () => {
  it('muestra carga, vacío, formulario y vuelta', async () => {
    let resolve!: (value: never[]) => void;
    const list = vi.fn(() => new Promise<never[]>((done) => { resolve = done; }));
    setup(list);
    const fixture = TestBed.createComponent(Admin);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const skeleton = el.querySelector('app-skeleton') as HTMLElement | null;
    expect(skeleton).not.toBeNull();
    expect(skeleton!.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.sr-only[role="status"]')?.textContent?.trim()).toBe('Cargando cursos…');
    expect(el.querySelectorAll('.sr-only[role="status"]')).toHaveLength(1);
    expect(el.textContent).toContain('Cargando cursos');
    resolve([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('app-skeleton')).toBeNull();
    expect(el.textContent).toContain('No hay cursos disponibles');
    el.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('h2')?.textContent).toContain('Crear curso');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('El título debe tener');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Volver'))!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('No hay cursos disponibles');
    expect(document.activeElement?.textContent).toBe('Cursos');
  });

  it('muestra un esqueleto accesible al cargar el editor del curso', async () => {
    let resolve!: (value: Course[]) => void;
    setup(vi.fn(() => new Promise<Course[]>((done) => { resolve = done; })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/curso/c1/datos', Admin);
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const skeleton = el.querySelector('app-skeleton') as HTMLElement | null;
    expect(skeleton?.querySelector('.skeleton')?.getAttribute('data-variant')).toBe('text');
    expect(skeleton!.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.sr-only[role="status"]')?.textContent?.trim()).toBe('Cargando datos del curso…');
    resolve([course]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.querySelector('app-skeleton')).toBeNull();
  });

  it('muestra un esqueleto accesible al cargar la estructura', async () => {
    let resolve!: (value: Course[]) => void;
    setup(vi.fn(() => new Promise<Course[]>((done) => { resolve = done; })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/curso/c1/estructura', Admin);
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const skeleton = el.querySelector('app-skeleton') as HTMLElement | null;
    expect(skeleton?.querySelector('.skeleton')?.getAttribute('data-variant')).toBe('list');
    expect(skeleton!.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.sr-only[role="status"]')?.textContent?.trim()).toBe('Cargando estructura…');
    resolve([course]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.querySelector('app-skeleton')).toBeNull();
  });

  it('ignora respuestas de carga anteriores a la más reciente', async () => {
    const pending: ((value: Course[]) => void)[] = [];
    const list = vi.fn(() => new Promise<Course[]>((done) => pending.push(done)));
    setup(list);
    const fixture = TestBed.createComponent(Admin);
    const latest = fixture.componentInstance.load();
    const newer = { ...course, title: 'Nuevo' };
    pending[1]([newer]);
    await latest;
    pending[0]([]);
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nuevo');
    expect(fixture.nativeElement.textContent).not.toContain('No hay cursos disponibles');
  });

  it('muestra error y permite reintentar', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValue([]);
    setup(list);
    const fixture = TestBed.createComponent(Admin);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No se han podido cargar');
    expect(el.textContent).not.toContain('private');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reintentar'))!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('No hay cursos disponibles');
  });

  it('renderiza las cinco secciones con el item activo desde la ruta y un solo h1', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    const admin = await harness.navigateByUrl('/admin/curso/c1/datos', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const nav = el.querySelector('nav[aria-label="Secciones del curso"]');
    expect(nav?.querySelectorAll('a').length).toBe(5);
    expect(el.querySelector('a[aria-current="page"]')?.textContent).toBe('Datos del curso');
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent).toBe('Panel de administración');
    expect(el.querySelector('.course-header')?.textContent).toContain('Curso uno');
    expect(el.querySelector('.status-badge')?.textContent).toBe('Borrador');
    expect(admin.courseId()).toBe('c1');
  });

  it('cambia de sección sin destruir el contenedor y lleva el foco al encabezado', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    const admin = await harness.navigateByUrl('/admin/curso/c1/datos', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const heading = (harness.fixture.nativeElement as HTMLElement).querySelector('.section-heading');
    expect(document.activeElement).not.toBe(heading);
    await harness.navigateByUrl('/admin/curso/c1/estructura');
    await harness.fixture.whenStable();
    harness.detectChanges();
    await Promise.resolve();
    harness.detectChanges();
    expect(adminFrom(harness)).toBe(admin);
    expect(admin.courseId()).toBe('c1');
    expect(document.activeElement?.textContent).toBe('Estructura');
  });

  it('conserva los enlaces profundos antiguos dentro del workspace', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/c1/l1/video', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    let el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('nav[aria-label="Secciones del curso"]')).not.toBeNull();
    expect(el.querySelector('a[aria-current="page"]')?.textContent).toContain('Lección');
    expect(adminFrom(harness).lessonId()).toBe('l1');
    await harness.navigateByUrl('/admin/vista-previa/c1/l1');
    await harness.fixture.whenStable();
    harness.detectChanges();
    el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('Vista previa del aula');
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('nav[aria-label="Secciones del curso"]')).not.toBeNull();
  });

  it('el nombre accesible coincide con el texto visible', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const link = (harness.fixture.nativeElement as HTMLElement)
      .querySelector<HTMLAnchorElement>('.admin-courses a')!;
    expect(link.textContent).toContain('Editar curso: Curso uno');
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link.getAttribute('href')).toBe('/admin/curso/c1/datos');
    expect(link.tabIndex).toBe(0);
  });

  it('muestra la descripción interna solo cuando existe y sin dejar hueco', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/curso/c1/leccion/l1', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.lesson-note')?.textContent).toContain('Descripción larga de uso interno');
    expect(el.querySelector('.lesson-note')?.textContent).toContain('Resumen interno');
    const repo = TestBed.inject(StructureRepository) as unknown as { list: ReturnType<typeof vi.fn> };
    repo.list.mockResolvedValueOnce({ sections: [], lessons: [{ ...lesson, id: 'l2', summary: null, content_md: null }] });
    await harness.navigateByUrl('/admin/curso/c1/leccion/l2');
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(el.querySelector('.lesson-note')).toBeNull();
    expect(el.textContent).not.toContain('Descripción interna de la lección');
  });

  it('el logout limpia la lección activa y descarta respuestas tardías', async () => {
    const session = signal<{ user: { id: string } } | null>({ user: { id: 'admin' } });
    let finish!: (value: { sections: unknown[]; lessons: Lesson[] }) => void;
    const structureList = vi.fn(() => new Promise<{ sections: unknown[]; lessons: Lesson[] }>((done) => { finish = done; }));
    setup(undefined, structureList, session);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/curso/c1/leccion/l1', Admin);
    harness.detectChanges();
    const admin = adminFrom(harness);
    expect(admin.lessonId()).toBe('l1');
    session.set(null);
    harness.detectChanges();
    expect(admin.lessonId()).toBeNull();
    finish({ sections: [], lessons: [lesson] });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(admin.lessonNote()).toBe('');
    expect((harness.fixture.nativeElement as HTMLElement).querySelector('.lesson-note')).toBeNull();
  });

  it('muestra el estado como badge con texto y forma, y el listado con jerarquía', async () => {
    const published = { ...course, id: 'c2', title: 'Curso dos', status: 'published' as const };
    setup(vi.fn().mockResolvedValue([course, published]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const badges = [...el.querySelectorAll<HTMLElement>('.admin-courses .status-badge')];
    expect(badges.map((badge) => badge.textContent?.trim())).toEqual(['Borrador', 'Publicado']);
    expect(badges[0].classList.contains('status-badge--draft')).toBe(true);
    expect(badges[1].classList.contains('status-badge--published')).toBe(true);
    expect(el.querySelector('.course-row__title')?.textContent).toContain('Curso uno');
    expect(el.querySelector('.course-row__link')?.textContent).toContain('Editar curso: Curso uno');
  });

  it('el estado vacío ofrece la acción real y no un botón falso', async () => {
    setup(vi.fn().mockResolvedValue([]));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-state')?.textContent).toContain('No hay cursos disponibles');
    const labels = [...el.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(labels).toContain('Crear curso');
    expect(labels).not.toContain('Volver a cursos');
  });

  it('el error de carga ofrece Reintentar y conserva Volver a cursos', async () => {
    setup(vi.fn().mockRejectedValue(new Error('detalle privado')));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/curso/c1/datos', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No se ha podido cargar este curso');
    expect(el.textContent).not.toContain('detalle privado');
    const labels = [...el.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(labels).toContain('Reintentar');
    expect(labels).toContain('Volver a cursos');
  });

  it('los nombres accesibles incluyen el texto visible de los controles', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/curso/c1/datos', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const labelled = el.querySelectorAll<HTMLElement>(
      'button[aria-label], a[aria-label], input[aria-label], select[aria-label]',
    );
    for (const control of labelled) {
      const visible = (control.textContent ?? '').trim();
      if (visible) {
        expect((control.getAttribute('aria-label') ?? '').toLowerCase()).toContain(visible.toLowerCase());
      }
    }
    await harness.navigateByUrl('/admin');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const link = el.querySelector<HTMLAnchorElement>('.admin-courses a')!;
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link.textContent).toContain('Editar curso: Curso uno');
  });

  it('usa clases responsive y sin tablas para listado y navegación', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('.admin-courses .course-row')).not.toBeNull();
    await harness.navigateByUrl('/admin/curso/c1/datos');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const nav = el.querySelector('nav[aria-label="Secciones del curso"]');
    expect(nav?.querySelector('.course-nav__list')).not.toBeNull();
    expect(nav?.querySelector('.course-nav__link')).not.toBeNull();
  });

  it('devuelve el foco al encabezado al salir del editor', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/nuevo', Admin);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const el = harness.fixture.nativeElement as HTMLElement;
    const back = [...el.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Volver a cursos')!;
    back.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    await Promise.resolve();
    harness.detectChanges();
    expect(document.activeElement?.textContent).toBe('Cursos');
  });
});

describe('Geometría de temas en el workspace editorial', () => {
  const adminStyles = readFileSync('src/app/features/admin/admin.scss', 'utf8');
  const editorStyles = readFileSync('src/app/features/admin/course-editor/course-editor.scss', 'utf8');

  function ruleBody(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  }

  it('la cabecera y los paneles declaran la escala de tema, no valores duros', () => {
    expect(ruleBody(adminStyles, '.course-header')).toMatch(/padding:\s*var\(--card-pad\)/);
    expect(ruleBody(adminStyles, '.course-header')).toMatch(/border:\s*var\(--border-width\)/);
    expect(ruleBody(adminStyles, '.course-header')).toMatch(/border-radius:\s*var\(--radius-md\)/);
    expect(ruleBody(adminStyles, '.course-header')).toMatch(/box-shadow:\s*var\(--shadow-card\)/);
    expect(ruleBody(adminStyles, '.status-panel')).toMatch(/padding:\s*var\(--card-pad\)/);
    expect(ruleBody(adminStyles, '.status-panel')).toMatch(/border-left:\s*calc\(var\(--border-width\)/);
    expect(adminStyles + editorStyles).not.toMatch(/--space-\d\s*:/);
    expect(adminStyles + editorStyles).not.toMatch(/--card-pad\s*:/);
  });

  it('listados, badges y navegación cambian huecos y radios por tema sin romper 44px', () => {
    expect(ruleBody(adminStyles, '.section-heading')).toMatch(/margin-top:\s*var\(--section-gap\)/);
    expect(ruleBody(adminStyles, '.course-nav__list')).toMatch(/gap:\s*var\(--space-2\)/);
    expect(ruleBody(adminStyles, '.course-row')).toMatch(/gap:\s*var\(--space-2\)/);
    expect(ruleBody(adminStyles, '.status-badge')).toMatch(/padding:\s*var\(--space-1\) var\(--space-2\)/);
    expect(ruleBody(adminStyles, '.course-nav__link')).toMatch(/border-radius:\s*var\(--radius-sm\)/);
    expect(ruleBody(adminStyles, '.course-nav__link')).toMatch(/min-height:\s*44px/);
    expect(adminStyles).not.toMatch(/border-radius:\s*8px/);
    expect(adminStyles).not.toMatch(/border:\s*1px\s+solid/);
  });

  it('el editor usa la misma escala en campos y feedback', () => {
    expect(ruleBody(editorStyles, 'textarea, select')).toMatch(/padding:\s*var\(--space-2\) var\(--space-3\)/);
    expect(ruleBody(editorStyles, 'textarea, select')).toMatch(/border:\s*var\(--border-width\)/);
    expect(ruleBody(editorStyles, 'textarea, select')).toMatch(/border-radius:\s*var\(--radius-sm\)/);
    expect(ruleBody(editorStyles, '.form-error-summary')).toMatch(/border-left:\s*calc\(var\(--border-width\)/);
    expect(ruleBody(editorStyles, '.form-error-summary ul')).toMatch(/padding-left:\s*var\(--space-4\)/);
    expect(editorStyles).not.toMatch(/border-radius:\s*var\(--radius\);/);
  });
});
