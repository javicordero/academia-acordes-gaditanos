import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { PublicCoursesRepository } from '../public-courses-repository';
import { CourseDetail } from './course-detail';

describe('Ficha de curso', () => {
  it('muestra contenido como texto y advierte de la lista filtrada', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'cursos/:slug', component: CourseDetail }]),
      { provide: PublicCoursesRepository, useValue: { detail: vi.fn().mockResolvedValue({
        course: { id: '1', slug: 'ejemplo', title: 'Curso', level: 'basico', description: '<img src=x>', summary: null },
        sections: [{ id: 's', title: 'Bloque', summary: null }],
        lessons: [{ id: 'l', section_id: 's', slug: 'muestra', title: 'Muestra', is_free_preview: true }],
      }) } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cursos/ejemplo', CourseDetail);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('img')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('<img src=x>');
    expect(harness.routeNativeElement?.textContent).toContain('puede no ser el programa completo');
  });

  it('enlaza cada lección accesible con el aula usando el slug del curso y de la lección', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'cursos/:slug', component: CourseDetail }]),
      { provide: PublicCoursesRepository, useValue: { detail: vi.fn().mockResolvedValue({
        course: { id: '1', slug: 'curso-ejemplo', title: 'Curso', level: 'basico', description: null, summary: null },
        sections: [{ id: 's', title: 'Bloque', summary: null }],
        lessons: [
          { id: 'l1', section_id: 's', slug: 'leccion-muestra', title: 'Muestra', is_free_preview: true },
          { id: 'l2', section_id: 's', slug: 'leccion-comprada', title: 'Comprada', is_free_preview: false },
        ],
      }) } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cursos/curso-ejemplo', CourseDetail);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const links = Array.from(
      harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>('a[href^="/aula/"]') ?? [],
    ).map((a) => a.getAttribute('href'));

    expect(links).toEqual([
      '/aula/curso-ejemplo/leccion-muestra',
      '/aula/curso-ejemplo/leccion-comprada',
    ]);
  });
});
