import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonMaterials } from '../../aula/lesson-materials/lesson-materials';
import { VideoPlaybackService } from '../../aula/video-playback';
import { PreviewRepository } from './preview-repository';
import { Preview } from './preview';

@Component({ selector: 'app-lesson-materials', template: '' })
class MaterialsStub {
  readonly lessonId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly returnUrl = input.required<string>();
}

describe('Vista previa administrativa', () => {
  const courseId = '11111111-1111-1111-1111-111111111111';
  const sectionId = '22222222-2222-2222-2222-222222222222';
  const firstId = '33333333-3333-3333-3333-333333333333';
  const secondId = '44444444-4444-4444-4444-444444444444';
  const foreignId = '55555555-5555-5555-5555-555555555555';
  const course = { id: courseId, title: 'Curso borrador' };
  const sections = [{ id: sectionId, course_id: courseId, title: 'Bloque', summary: null, position: 0 }];
  const first = { id: firstId, course_id: courseId, section_id: sectionId, slug: 'primera',
    title: 'Primera', summary: null, content_md: '<img src=x onerror=alert(1)>', position: 0,
    duration_seconds: null, is_free_preview: false, is_published: false };
  const second = { ...first, id: secondId, title: 'Segunda', content_md: 'Texto', position: 1 };
  const lessons = [first, second];
  const load = vi.fn();
  const path = (id?: string) => `/admin/vista-previa/${courseId}${id ? '/' + id : ''}`;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    load.mockReset();
    load.mockImplementation(async (_course: string, id: string | null) =>
      ({ course, sections, lessons, lesson: id ? lessons.find(l => l.id === id) ?? null : first }));
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        { path: 'admin/vista-previa/:courseId/:lessonId', component: Preview },
        { path: 'admin/vista-previa/:courseId', component: Preview },
      ]),
      { provide: AuthService, useValue: { session: signal({ user: { id: 'admin' } }), isAdmin: signal(true) } },
      { provide: PreviewRepository, useValue: { load } },
      { provide: VideoPlaybackService, useValue: { sourceForLesson: () => null } },
    ] });
    TestBed.overrideComponent(Preview, { remove: { imports: [LessonMaterials] }, add: { imports: [MaterialsStub] } });
    harness = await RouterTestingHarness.create();
  });

  it('muestra borrador con texto escapado, aviso y progreso de solo lectura', async () => {
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable();
    const root = harness.routeNativeElement!;
    expect(root.textContent).toContain('Vista previa de administración. No implica compra ni matrícula.');
    expect(root.textContent).toContain(first.content_md);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('En la vista previa no se guarda progreso de alumno.');
    expect(root.textContent).toContain('Curso borrador');
    expect(root.querySelector('button')?.textContent ?? '').not.toContain('completada');
    expect(load).toHaveBeenCalledWith(courseId, firstId);
  });

  it('explica cuando el curso no tiene lecciones', async () => {
    load.mockResolvedValueOnce({ course, sections: [], lessons: [], lesson: null });
    await harness.navigateByUrl(path(), Preview);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Curso borrador');
    expect(harness.routeNativeElement?.textContent).toContain('Añade una lección');
  });

  it('rechaza una lección ajena que el repositorio no encuentra en el curso', async () => {
    await harness.navigateByUrl(path(foreignId), Preview);
    await harness.fixture.whenStable();
    expect(load).toHaveBeenCalledWith(courseId, foreignId);
    expect(harness.routeNativeElement?.textContent).toContain('no está disponible');
    expect(harness.routeNativeElement?.textContent).not.toContain('Primera');
  });

  it('navega por las lecciones del curso y enfoca el encabezado', async () => {
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable();
    expect(document.activeElement?.id).toBe('preview-heading');
    const next = harness.routeNativeElement?.querySelector('nav[aria-label="Navegación entre lecciones"] a');
    expect(next?.textContent).toContain('Siguiente: Segunda');
    expect(next?.getAttribute('href')).toBe(path(secondId));
    await harness.navigateByUrl(path(secondId), Preview);
    await harness.fixture.whenStable();
    expect(document.activeElement?.id).toBe('preview-heading');
    const previous = harness.routeNativeElement?.querySelector('nav[aria-label="Navegación entre lecciones"] a');
    expect(previous?.textContent).toContain('Anterior: Primera');
    expect(previous?.getAttribute('href')).toBe(path(firstId));
    expect(TestBed.inject(Router).url).toBe(path(secondId));
  });

  it('descarta una carga antigua cuando cambian los parámetros', async () => {
    let resolveOld!: (data: { course: typeof course; sections: typeof sections; lessons: typeof lessons; lesson: typeof first }) => void;
    load.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.navigateByUrl(path(secondId), Preview);
    await harness.fixture.whenStable();
    resolveOld({ course, sections, lessons, lesson: first });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.querySelector('article h2')?.textContent).toContain('Segunda');
    expect(document.activeElement?.id).toBe('preview-heading');
  });
});
