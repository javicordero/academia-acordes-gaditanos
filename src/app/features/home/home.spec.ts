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

const panels = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('[data-section="cursos"] .home-courses'));

describe('Portada', () => {
  it('renderiza las secciones en el orden previsto con un solo h1', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section]'))
      .map((element) => element.dataset['section']);

    expect(sections).toEqual([
      'hero', 'cursos', 'aprenderas', 'preview',
      'profesor', 'testimonios', 'cta',
    ]);
    expect(sections[0]).toBe('hero');
    expect(root.querySelector('.home-banner')).toBeNull();
    expect(root.textContent).not.toContain('Academia en construcción');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
  });

  it('muestra un esqueleto accesible mientras carga el catálogo', async () => {
    let resolve!: (rows: PublicCourse[]) => void;
    const fixture = setup({
      list: vi.fn().mockReturnValue(new Promise<PublicCourse[]>(r => { resolve = r; })),
      detail: noDetail(),
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('card');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando cursos');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[autofocus]')).toBeNull();
    resolve([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('app-skeleton')).toBeNull();
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
    const primero = panels(root)[0]!;

    expect(primero.querySelectorAll('.home-card')).toHaveLength(3);
    expect(Array.from(primero.querySelectorAll('.home-card__course'))
      .map((element) => element.textContent?.trim()))
      .toEqual(['Curso uno', 'Curso dos', 'Curso tres']);
    expect(primero.querySelectorAll('.home-card__level')).toHaveLength(0);
    expect(Array.from(primero.querySelectorAll('.home-card a'))
      .map((anchor) => anchor.getAttribute('href')))
      .toEqual(['/cursos/curso-uno', '/cursos/curso-dos', '/cursos/curso-tres']);
    expect(root.textContent).not.toContain('€');
    expect(root.textContent?.toLowerCase()).not.toContain('precio');
  });

  it('coloca los cursos justo bajo el hero con dos paneles y «Ver todos los cursos»', async () => {
    const courses = [
      course('1', 'curso-uno', 'Curso uno'),
      course('2', 'curso-dos', 'Curso dos'),
      course('3', 'curso-tres', 'Curso tres'),
      course('4', 'curso-cuatro', 'Curso cuatro'),
    ];
    const fixture = setup({ list: vi.fn().mockResolvedValue(courses), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const order = Array.from(root.querySelectorAll<HTMLElement>('[data-section]'))
      .map((element) => element.dataset['section']);
    expect(order[0]).toBe('hero');
    expect(order[1]).toBe('cursos');

    const bloques = panels(root);
    expect(bloques).toHaveLength(2);
    for (const bloque of bloques) {
      expect(bloque.classList.contains('home-surface')).toBe(false);
      const tarjetas = Array.from(bloque.querySelectorAll<HTMLElement>('.home-card'));
      expect(tarjetas).toHaveLength(3);
      for (const tarjeta of tarjetas) {
        expect(tarjeta.classList.contains('home-surface')).toBe(true);
      }
    }
    expect(bloques[0].querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('Aprende guitarra desde 0 orientado al Carnaval');
    expect(bloques[1].querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('Aprende guitarra intermedia · contenido de muestra');
    const covers = Array.from(root.querySelectorAll<HTMLImageElement>('.home-card__image'));
    expect(covers).toHaveLength(6);
    for (const image of covers) {
      expect(image.getAttribute('src')).toBe('images/curso-cover.png');
      expect(image.getAttribute('aria-hidden')).toBeNull();
    }
    for (const bloque of bloques) {
      expect(Array.from(bloque.querySelectorAll('.home-card__cover'))
        .every((cover) => cover.getAttribute('aria-hidden') === 'true')).toBe(true);
    }
    expect(root.innerHTML).not.toContain('curso-default');
    expect(Array.from(bloques[0].querySelectorAll('.home-card__badge'))
      .map((badge) => badge.textContent?.trim()))
      .toEqual(['1', '2', '3']);
    expect(root.querySelector('.home-courses__support strong')?.textContent)
      .toContain('repertorio del Carnaval de Cádiz');
    for (const image of Array.from(root.querySelectorAll('img'))) {
      expect(image.getAttribute('src')).not.toMatch(/^https?:/i);
    }
    expect(Array.from(bloques[0].querySelectorAll('.home-card a'))
      .map((anchor) => anchor.getAttribute('href')))
      .toEqual(['/cursos/curso-uno', '/cursos/curso-dos', '/cursos/curso-tres']);

    const all = root.querySelector<HTMLAnchorElement>('.home-cursos__all')!;
    expect(all).not.toBeNull();
    expect(all.getAttribute('href')).toBe('/cursos');
    expect(all.textContent?.trim()).toBe('Ver todos los cursos');
    expect(all.classList.contains('home-button')).toBe(true);
    expect(root.querySelectorAll('.home-cursos__all')).toHaveLength(1);

    const text = root.textContent ?? '';
    expect(text).not.toMatch(/pack|bundle|combo/i);
    expect(text).not.toMatch(/\d+\s*(?:€|\$|EUR|USD)\b/i);
    expect(text).not.toContain('precio');
  });

  it('rellena tres tarjetas repitiendo el primer curso real cuando solo hay uno', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const primero = panels(root)[0]!;

    const cards = Array.from(primero.querySelectorAll<HTMLElement>('.home-card'));
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.querySelector('a')?.getAttribute('href')))
      .toEqual(['/cursos/curso-uno', '/cursos/curso-uno', '/cursos/curso-uno']);
    expect(cards.map((card) => card.querySelector('.home-card__course')?.textContent?.trim()))
      .toEqual(['Curso uno', 'Curso uno', 'Curso uno']);
    expect(primero.textContent).not.toContain('De muestra');
  });

  it('marca solo la réplica cuando hay dos cursos reales', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([
        course('1', 'curso-uno', 'Curso uno'),
        course('2', 'curso-dos', 'Curso dos'),
      ]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const primero = panels(root)[0]!;

    expect(Array.from(primero.querySelectorAll('.home-card a'))
      .map((anchor) => anchor.getAttribute('href')))
      .toEqual(['/cursos/curso-uno', '/cursos/curso-dos', '/cursos/curso-uno']);
    expect(primero.textContent).not.toContain('De muestra');
  });

  it('no marca réplicas cuando hay tres o más cursos reales', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([
        course('1', 'curso-uno', 'Curso uno'),
        course('2', 'curso-dos', 'Curso dos'),
        course('3', 'curso-tres', 'Curso tres'),
        course('4', 'curso-cuatro', 'Curso cuatro'),
      ]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const primero = panels(root)[0]!;

    expect(primero.querySelectorAll('.home-card')).toHaveLength(3);
    expect(primero.textContent).not.toContain('De muestra');
  });

  it('muestra tres cursos de muestra intermedios que enlazan al catálogo real', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const segundo = panels(root)[1]!;

    const cards = Array.from(segundo.querySelectorAll<HTMLElement>('.home-card'));
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.querySelector('.home-card__course')?.textContent?.trim()))
      .toEqual([
        'Curso de muestra · Intermedio 1',
        'Curso de muestra · Intermedio 2',
        'Curso de muestra · Intermedio 3',
      ]);
    for (const card of cards) {
      const link = card.querySelector<HTMLAnchorElement>('a')!;
      expect(link.getAttribute('href')).toBe('/cursos');
      expect(link.textContent?.trim()).toBe('Ver catálogo');
    }
    expect(segundo.textContent).not.toContain('De muestra');
    expect(segundo.querySelectorAll('.home-card__level')).toHaveLength(0);
    expect(segundo.querySelectorAll('a[href^="/cursos/"]')).toHaveLength(0);
  });

  it('declara tres columnas en escritorio y 2+1 en móvil con fuentes y miniaturas reducidas', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();

    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');
    expect(styles).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
    expect(styles).toContain('object-fit:cover');
    expect(styles).toContain('height:5rem');
    expect(styles).toContain('height:3.5rem');
    expect(styles).toContain('margin-top:calc(var(--space-5)+var(--space-4))');
    expect(styles).toMatch(/h2\[_ngcontent[^\]]+\]\{margin-top:0;?\}/);
    expect(styles).not.toContain('margin-top:2.25rem');

    const inicio = styles.indexOf('@media(max-width:48rem)');
    const fin = styles.indexOf('@media(max-width:20rem)');
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const movil = styles.slice(inicio, fin);
    expect(movil).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(movil).toContain('grid-column:1/-1');
    expect(movil).toContain('justify-self:center');
    expect(movil).toContain('font-size:var(--font-size-md)');
    expect(movil).toContain('font-size:var(--font-size-sm)');
  });

  it('no muestra etiquetas de muestra ni nivel en las tarjetas, pero conserva la nota del profesor', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const cursos = root.querySelector<HTMLElement>('[data-section="cursos"]')!;
    expect(cursos.querySelectorAll('.home-card__demo')).toHaveLength(0);
    expect(cursos.querySelectorAll('.home-card__level')).toHaveLength(0);
    expect(cursos.textContent).not.toMatch(/De muestra/);
    expect(cursos.textContent).toContain('desde 0');
    expect(cursos.textContent).toContain('intermedia');

    const profesor = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    expect(profesor.textContent).toContain('Pablo Franco Toscano');
    expect(profesor.textContent).not.toContain('Contenido de muestra');
  });

  it('compensa el padding del shell, alterna fondos con líneas y no crea cards fuera de los cursos', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const section = (name: string) => root.querySelector<HTMLElement>(`[data-section="${name}"]`)!;
    expect(section('aprenderas').classList.contains('home-section--tint-b')).toBe(true);
    expect(section('preview').classList.contains('home-section--tint-a')).toBe(true);
    expect(section('profesor').classList.contains('home-section--tint-b')).toBe(true);
    expect(section('testimonios').classList.contains('home-section--tint-a')).toBe(true);
    for (const name of ['hero', 'cursos', 'profesor', 'testimonios', 'cta']) {
      expect(section(name).classList.contains('home-surface')).toBe(false);
    }
    expect(section('hero').querySelector('.home-visual')?.classList.contains('home-surface')).toBe(false);
    const divider = section('cursos').querySelector<HTMLElement>('.home-divider')!;
    expect(divider).not.toBeNull();
    expect(divider.previousElementSibling?.classList.contains('home-courses')).toBe(true);
    expect(divider.nextElementSibling?.classList.contains('home-courses')).toBe(true);
    expect(divider.getAttribute('aria-hidden')).toBe('true');

    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');
    expect(styles).toContain('margin:calc(-1*clamp(2rem,6vw,4rem))calc(50%-50vw)-4rem');
    expect(styles).toContain('width:100vw');
    expect(styles).toContain('overflow-x:clip');
    expect(styles).toContain('padding-inline:clamp(1.25rem,5vw,3rem)');
    expect(styles).toContain('padding-block:clamp(1rem,2.5vw,2rem)');
    expect(styles).toContain('max-width:var(--content-max-width)');
    expect(styles).toContain('margin-inline:auto');
    for (const name of ['hero', 'cursos', 'aprenderas', 'preview', 'profesor', 'testimonios', 'cta']) {
      expect(section(name).querySelector('.home-inner')).not.toBeNull();
    }
    const homeRule = styles.match(/\.home\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    expect(homeRule).not.toContain('max-width');
    expect(homeRule).toContain('calc(50%-50vw)');
    expect(styles).toContain('border-bottom:var(--border-width)solidvar(--border)');
    expect(styles).toContain('border-top:var(--border-width)solidvar(--border)');
    expect(styles).toContain('background:var(--bg)');
    expect(styles).toContain('background:var(--surface)');
  });

  it('mantiene un único enlace al catálogo dentro de la sección de cursos', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const cursos = root.querySelector<HTMLElement>('[data-section="cursos"]')!;
    const catalogLinks = Array.from(cursos.querySelectorAll<HTMLAnchorElement>('a[href="/cursos"]'));
    expect(catalogLinks).toHaveLength(1);
    expect(catalogLinks[0].textContent?.trim()).toBe('Ver todos los cursos');
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

  it('muestra el banner editorial con h1, subtítulo y lead honestos', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const hero = root.querySelector<HTMLElement>('[data-section="hero"]')!;

    const titulo = hero.querySelector('h1')!;
    const subtitulo = hero.querySelector<HTMLElement>('.home-subtitle')!;
    expect(titulo.textContent?.trim()).toBe('Academia de Guitarra');
    expect(subtitulo.textContent?.trim()).toBe('De Acordes Gaditanos');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(hero.querySelector('.home-eyebrow')).toBeNull();
    expect(titulo.compareDocumentPosition(subtitulo) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeGreaterThan(0);
    expect(hero.querySelector('.home-lead')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('Academia online para aprender guitarra y acercarse al repertorio del Carnaval de Cádiz. Cursos, lecciones y progreso en un mismo sitio.');
  });

  it('enlaza los CTAs del hero a rutas reales sin simular sesión ni pago', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const hero = root.querySelector<HTMLElement>('[data-section="hero"]')!;

    const actions = Array.from(hero.querySelectorAll<HTMLAnchorElement>('.home-actions a'));
    expect(actions).toHaveLength(1);
    expect(actions[0].getAttribute('href')).toBe('/cursos');
    expect(actions[0].textContent?.trim()).toBe('Ver cursos');
    expect(hero.textContent).not.toContain('Mi biblioteca');
    expect(hero.textContent).not.toMatch(/inicia sesión|regístrate|pagar|comprar|precio/i);
  });

  it('resuelve aria-labelledby de cursos en el h2 sin eyebrow y conserva el eyebrow del hero', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const cursos = root.querySelector<HTMLElement>('[data-section="cursos"]')!;
    expect(cursos.getAttribute('aria-labelledby')).toBe('home-cursos');
    expect(root.querySelectorAll('#home-cursos')).toHaveLength(1);
    expect(root.querySelector('#home-cursos')?.tagName).toBe('H2');
    expect(cursos.querySelector('.home-eyebrow')).toBeNull();
    expect(root.querySelector('.home-eyebrow')).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-section="hero"] .home-subtitle')?.textContent?.trim())
      .toBe('De Acordes Gaditanos');
  });

  it('usa un visual SVG decorativo propio y no inventa claims de producto', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const hero = root.querySelector<HTMLElement>('[data-section="hero"]')!;
    const visual = hero.querySelector<HTMLElement>('.home-hero__visual')!;

    expect(visual.getAttribute('aria-hidden')).toBe('true');
    expect(visual.querySelector('svg')).not.toBeNull();
    expect(visual.querySelector('img')).toBeNull();
    expect(visual.querySelector('.home-visual__monogram')?.textContent?.trim()).toBe('AG');
    expect(visual.querySelectorAll('.home-visual__waves path').length).toBeGreaterThan(0);
    expect(visual.querySelectorAll('.home-visual__strings path').length).toBeGreaterThan(0);

    const text = root.textContent ?? '';
    expect(text).not.toMatch(/\d+\s*(?:€|\$|EUR|USD)\b/i);
    expect(text).not.toMatch(/\d+\s*(?:cursos|lecciones|horas|meses|años|días)\b/i);
    expect(text).not.toMatch(/garantiz|resultados asegurados|método propio|sin experiencia/i);
  });

  it('presenta los testimonios como espacio preparado y honesto, sin datos inventados', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const testimonials = root.querySelector('[data-section="testimonios"]')!;
    expect(testimonials.querySelector('.home-prepared')?.textContent)
      .toContain('Aquí se incorporarán testimonios reales cuando estén disponibles');
    expect(testimonials.textContent).toContain('Todavía no hay testimonios publicados');
    expect(testimonials.querySelector('img')).toBeNull();
    expect(testimonials.querySelector('blockquote')).toBeNull();
    expect(root.textContent).not.toMatch(/\d+\s*(?:€|\$|EUR|USD)\b/i);
  });

  it('muestra el nombre definitivo del profesor con subtítulo y texto de ejemplo', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    expect(teacher.querySelector('h2')?.textContent?.trim()).toBe('Tu profesor');
    expect(teacher.querySelector('.home-teacher__lead')?.textContent?.trim())
      .toBe('Pablo Franco Toscano');
    expect(teacher.querySelector('.home-teacher__role')?.textContent?.trim())
      .toBe('Profesor de guitarra de conservatorio');
    expect(teacher.querySelector('.home-teacher__bio')?.textContent)
      .toContain('repertorio del Carnaval de Cádiz');
    expect(teacher.textContent).not.toContain('Contenido de muestra · pendiente de sustituir');
    expect(teacher.textContent).not.toContain('Foto de muestra · se sustituirá por la imagen definitiva');
    expect(teacher.textContent).not.toContain('Profesor de muestra');
  });

  it('usa un placeholder local accesible y no inventa credenciales, correos ni testimonios', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    const image = teacher.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('images/profesor-placeholder.svg');
    const alt = (image?.getAttribute('alt') ?? '').trim();
    expect(alt.toLowerCase()).toMatch(/muestra/);

    const text = teacher.textContent ?? '';
    expect(text).not.toContain('@');
    expect(text).not.toMatch(/licenciado|graduado|certificado|titulado|años de experiencia|premio/i);
    expect(teacher.querySelector('blockquote')).toBeNull();
  });

  it('coloca el visual del profesor sobre el texto en móvil y mantiene dos columnas en escritorio', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    const children = Array.from(teacher.querySelectorAll<HTMLElement>('.home-teacher__grid > *'));
    const visualIndex = children.findIndex((element) => element.classList.contains('home-teacher__visual'));
    const textIndex = children.findIndex((element) => element.classList.contains('home-teacher__text'));
    expect(visualIndex).toBeGreaterThanOrEqual(0);
    expect(visualIndex).toBeLessThan(textIndex);

    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');
    expect(styles).toContain('grid-template-columns:minmax(0,42fr)minmax(0,58fr)');
    expect(styles).toContain('order:1');
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
    expect(styles).toContain('@media(max-width:20rem)');
    expect(styles).toContain('min-height:44px');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('prefers-reduced-motion');
    expect(styles).toContain('aspect-ratio');
    // Geometría gobernada por tokens de tema: cambia de tema sin recargar.
    for (const token of ['--content-max-width', '--section-gap', '--grid-gap', '--card-pad', '--border-width', '--radius-md']) {
      expect(styles).toContain(`var(${token}`);
    }
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
