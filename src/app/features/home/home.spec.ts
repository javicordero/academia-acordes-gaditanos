import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import {
  PublicCourse,
  PublicCoursesRepository,
} from '../cursos/public-courses-repository';
import { Home } from './home';

// Datos ficticios de prueba: no son cursos reales del catálogo.
const course = (id: string, slug: string, title: string): PublicCourse => ({
  id,
  slug,
  title,
  summary: null,
  description: null,
  level: 'basico',
});

function setup(repository: Partial<PublicCoursesRepository>) {
  TestBed.configureTestingModule({
    imports: [Home],
    providers: [
      provideRouter([]),
      { provide: PublicCoursesRepository, useValue: repository },
    ],
  });
  return TestBed.createComponent(Home);
}

const noDetail = () => vi.fn().mockResolvedValue(null);

describe('Portada', () => {
  it('renderiza las secciones en el orden previsto con un solo h1', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section]'))
      .map((element) => element.dataset['section']);

    expect(sections).toEqual([
      'banner', 'hero', 'aprenderas', 'cursos', 'preview',
      'profesor', 'testimonios', 'cta',
    ]);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
  });

  it('muestra hasta tres cursos del repositorio sin precios inventados', async () => {
    const courses = [
      course('1', 'curso-uno', 'Curso uno'),
      course('2', 'curso-dos', 'Curso dos'),
      course('3', 'curso-tres', 'Curso tres'),
      course('4', 'curso-cuatro', 'Curso cuatro'),
    ];
    const fixture = setup({
      list: vi.fn().mockResolvedValue(courses),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.home-card')).toHaveLength(3);
    expect(Array.from(root.querySelectorAll('.home-card__slug'))
      .map((element) => element.textContent?.trim()))
      .toEqual(['curso-uno', 'curso-dos', 'curso-tres']);
    expect(root.textContent).toContain('Publicado');
    expect(Array.from(root.querySelectorAll('.home-card a'))
      .map((anchor) => anchor.getAttribute('href')))
      .toEqual(['/cursos/curso-uno', '/cursos/curso-dos', '/cursos/curso-tres']);
    expect(root.textContent).not.toContain('€');
    expect(root.textContent?.toLowerCase()).not.toContain('precio');
  });

  it('ofrece CTAs a rutas reales con texto visible como nombre accesible', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const hrefs = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'))
      .map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).toContain('/cursos');
    expect(hrefs).toContain('/mis-cursos');
    expect(root.querySelector('.home-button--primary')?.textContent?.trim()).toBe('Ver cursos');
    for (const anchor of Array.from(root.querySelectorAll('a'))) {
      expect(anchor.textContent?.trim()).not.toBe('');
    }
  });

  it('presenta profesor y testimonios como huecos honestos sin datos inventados', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Aquí se presentará al profesor');
    expect(root.textContent).toContain('Todavía no hay testimonios publicados');
    expect(root.querySelector('[data-section="profesor"] img')).toBeNull();
    expect(root.querySelector('[data-section="testimonios"] img')).toBeNull();
  });

  it('muestra un estado vacío honesto y enlace al catálogo cuando no hay cursos', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Todavía no hay cursos publicados');
    expect(root.querySelector('.home-card')).toBeNull();
    expect(root.querySelector('[data-section="cursos"] a[href="/cursos"]')).not.toBeNull();
  });

  it('enlaza una lección de muestra real marcada como gratuita', async () => {
    const detail = vi.fn().mockImplementation((slug: string) =>
      Promise.resolve(slug === 'curso-uno' ? {
        course: course('1', 'curso-uno', 'Curso uno'),
        sections: [],
        lessons: [{
          id: 'leccion-1',
          section_id: 'bloque-1',
          slug: 'leccion-muestra',
          title: 'Lección de muestra',
          is_free_preview: true,
        }],
      } : null));
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail,
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const hrefs = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'))
      .map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).toContain('/aula/curso-uno/leccion-muestra');
    expect(root.textContent).toContain('Ver lección de muestra');
  });

  it('no ofrece enlace de aula si no hay ninguna lección de muestra', async () => {
    const detail = vi.fn().mockResolvedValue({
      course: course('1', 'curso-uno', 'Curso uno'),
      sections: [],
      lessons: [{
        id: 'leccion-1',
        section_id: 'bloque-1',
        slug: 'leccion-privada',
        title: 'Lección privada',
        is_free_preview: false,
      }],
    });
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail,
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('a[href^="/aula/"]')).toBeNull();
    expect(root.textContent).toContain('cuando están disponibles');
  });

  it('asocia cada sección con su encabezado mediante aria-labelledby', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    for (const section of Array.from(root.querySelectorAll<HTMLElement>('section[data-section]'))) {
      const labelledBy = section.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(root.querySelector(`#${labelledBy}`)).not.toBeNull();
    }
  });

  it('declara responsive, objetivo táctil, foco y movimiento reducido sin píxeles frágiles', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.home-hero')).not.toBeNull();
    expect(root.querySelector('.home-cards, .home-note')).not.toBeNull();
    expect(root.querySelector('.home-button')).not.toBeNull();

    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');
    expect(styles).toContain('@media(max-width:48rem)');
    expect(styles).toContain('min-height:44px');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('prefers-reduced-motion');
  });

  it('distingue el catálogo no configurado de un catálogo vacío', async () => {
    const fixture = setup({
      list: vi.fn().mockRejectedValue(new Error('unavailable')),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('necesita configurar la conexión');
    expect(root.textContent).not.toContain('Todavía no hay cursos publicados');
  });
});
