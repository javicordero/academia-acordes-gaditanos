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
    expect(el.textContent).toContain('Cargando cursos');
    resolve([]);
    await fixture.whenStable();
    fixture.detectChanges();
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
});
