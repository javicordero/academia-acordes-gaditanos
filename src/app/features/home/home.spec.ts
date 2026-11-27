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

// CSS encapsulado: se comprueban reglas declaradas y tokens, no cadenas de píxeles.
const cssText = (): string => Array.from(document.querySelectorAll('style'))
  .map((style) => style.textContent ?? '')
  .join('\n')
  .replace(/\s+/g, '');

const ruleFor = (css: string, className: string): string =>
  css.match(new RegExp(`\\.${className}\\[_ngcontent[^\\]]+\\]\\{([^}]*)\\}`))?.[1] ?? '';

describe('Portada', () => {
  it('renderiza las secciones en el orden previsto con un solo h1', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section]'))
      .map((element) => element.dataset['section']);

    expect(sections).toEqual([
      'hero', 'cursos', 'aprenderas', 'profesor', 'cta',
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
    expect(root.querySelector('#home-cursos')?.textContent?.trim()).toBe('Nuestros cursos');
    expect(bloques.map(b => b.querySelector('h3')?.textContent?.trim()))
      .toEqual(['Guitarra desde cero', 'Guitarra intermedia']);
    expect(bloques[1].querySelector('.label')?.textContent?.trim()).toBe('Contenido de muestra');
    const covers = Array.from(root.querySelectorAll<HTMLImageElement>('.home-card__image'));
    expect(covers).toHaveLength(6);
    for (const image of covers) {
      expect(image.getAttribute('src')).toBe('images/curso-cover.png');
      expect(image.getAttribute('aria-hidden')).toBeNull();
    }
    for (const bloque of bloques) {
      expect(Array.from(bloque.querySelectorAll('.cover'))
        .every((cover) => cover.getAttribute('aria-hidden') === 'true')).toBe(true);
    }
    expect(root.innerHTML).not.toContain('curso-default');
    expect(Array.from(bloques[0].querySelectorAll('.badge'))
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
      const link = card.querySelector<HTMLAnchorElement>('a.home-card__link')!;
      expect(link.getAttribute('href')).toBe('/cursos');
      expect(link.getAttribute('aria-label')).toBe('Ver catálogo de cursos');
      expect(card.querySelector('.home-button')?.textContent?.trim()).toBe('Ver catálogo');
    }
    expect(segundo.textContent).not.toContain('De muestra');
    expect(segundo.querySelectorAll('.home-card__level')).toHaveLength(0);
    expect(segundo.querySelectorAll('a[href^="/cursos/"]')).toHaveLength(0);
  });

  it('mantiene tres columnas en escritorio y la tercera centrada en la rejilla móvil', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const styles = cssText();
    expect(styles).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
    const mobile = styles.slice(styles.indexOf('@media(max-width:48rem)'));
    expect(mobile).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(mobile).toContain('grid-column:1/-1');
    expect(mobile).toContain('justify-self:center');
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
    expect(cursos.textContent).toContain('desde cero');
    expect(cursos.textContent).toContain('intermedia');

    const profesor = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    expect(profesor.textContent).toContain('Pablo Franco Toscano');
    expect(profesor.textContent).not.toContain('Contenido de muestra');
  });

  it('reserva las tarjetas para los cursos y mantiene un divisor entre ambos bloques', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([course('1', 'curso', 'Curso')]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('section')).toHaveLength(5);
    for (const section of root.querySelectorAll('section')) {
      expect(section.firstElementChild?.classList.contains('home-inner')).toBe(true);
      if (section.dataset['section'] !== 'cursos') expect(section.querySelector('.home-surface')).toBeNull();
    }
    const divider = root.querySelector('hr.home-divider')!;
    expect(divider.previousElementSibling).toBe(panels(root)[0]);
    expect(divider.nextElementSibling).toBe(panels(root)[1]);
  });

  it('alterna bandas grises y blancas a sangre, con el catálogo sobre blanco', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([course('1', 'curso', 'Curso')]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const styles = cssText();
    const base = ruleFor(styles, 'home').match(/--band:([^;}]+)/)?.[1];
    expect(base).toBe('var(--surface)');
    const bands = Array.from(root.querySelectorAll('section'), section =>
      Array.from(section.classList, name => ruleFor(styles, name).match(/--band:([^;}]+)/)?.[1])
        .find(value => value !== undefined) ?? base);
    expect(bands).toEqual([
      'var(--bg)', base, 'var(--bg)', base, 'var(--bg)',
    ]);
    expect(styles).toContain('border-image-outset:0100vi');
  });

  it('hace clicable toda la tarjeta con un solo enlace y un span decorativo', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    for (const card of Array.from(root.querySelectorAll<HTMLElement>('.home-card'))) {
      const links = card.querySelectorAll('a');
      expect(links).toHaveLength(1);
      const link = links[0]!;
      expect(link.classList.contains('home-card__link')).toBe(true);
      expect(link.getAttribute('aria-label')).toBeTruthy();
      expect(card.querySelectorAll('button')).toHaveLength(0);
      const span = card.querySelector<HTMLElement>('.home-button--primary')!;
      expect(span.tagName).toBe('SPAN');
      expect(span.getAttribute('aria-hidden')).toBe('true');
      expect(span.getAttribute('href')).toBeNull();
      expect(span.getAttribute('tabindex')).toBeNull();
      expect(span.parentElement).toBe(card);
      expect(link.parentElement).toBe(card);
    }
    expect(root.querySelectorAll('.home-card__link[href^="/cursos/"]')).toHaveLength(3);
    expect(root.querySelectorAll('.home-card__link[href="/cursos"]')).toHaveLength(3);
  });

  it('asocia cada cubierta decorativa y su indicación de acción a un único título', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([course('1', 'curso', 'Curso')]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    for (const card of root.querySelectorAll('.home-card')) {
      const image = card.querySelector('img')!;
      expect(image.alt).toBe('');
      expect(image.closest('[aria-hidden=true]')).not.toBeNull();
      expect(card.querySelector('h4')?.textContent?.trim()).toBeTruthy();
      expect(card.lastElementChild?.matches('span.cue[aria-hidden=true]')).toBe(true);
    }
    const link = ruleFor(cssText(), 'home-card__link');
    expect(link).toContain('position:absolute');
    expect(link).toContain('inset:0');
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
    expect(root.querySelector('.home-button--primary')?.textContent?.trim()).toBe('Nuestros cursos');
    for (const anchor of Array.from(root.querySelectorAll('a'))) {
      const nombre = anchor.textContent?.trim() || anchor.getAttribute('aria-label');
      expect(nombre).toBeTruthy();
    }
  });

  it('reserva el relleno azul tinta al único enlace primario y mantiene el externo discreto', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([course('1', 'curso', 'Curso')]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const primary = root.querySelectorAll('a.home-button--primary');
    expect(primary).toHaveLength(1);
    expect(primary[0].closest('[data-section="hero"]')).not.toBeNull();
    expect(root.querySelector('.home-hero a.quiet')?.textContent?.trim()).toBe('Acordes Gaditanos');
    const styles = cssText();
    expect(styles).toMatch(/\.home-hero[^{}]*\.home-button--primary[^{}]*\{[^}]*background:var\(--accent-strong\);color:var\(--accent-strong-ink\)/);
    expect(styles.match(/background:var\(--accent-strong\)/g)).toHaveLength(1);
    expect(styles).not.toMatch(/\.home-button--primary[^{}]*:hover[^{}]*\{[^}]*background/);
  });

  it('permite localizar la tarjeta por foco o puntero sin desplazarla ni filtrar colores', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const styles = cssText();
    expect(styles).toContain(':is(:hover,:focus-within)');
    expect(styles).toContain('outline:var(--focus-ring)solidvar(--focus)');
    expect(styles).not.toMatch(/filter:brightness|transform:translateY/i);
  });

  it('muestra la imagen aportada del profesor sin distorsión y con alternativa textual', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    const figure = teacher.querySelector<HTMLElement>('figure.home-teacher__visual')!;
    const image = figure.querySelector<HTMLImageElement>('img.home-teacher__image')!;


    expect(figure.contains(image)).toBe(true);

    expect(image.getAttribute('width')).toBe('1024');
    expect(image.getAttribute('height')).toBe('683');
    expect(image.alt).toContain('Fotografía aportada');

    const styles = cssText();
    const imageRule = styles.match(/(?:^|})img\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    expect(imageRule).toContain('object-fit:cover');
    expect(imageRule).not.toContain('object-fit:fill');
    expect(styles).toMatch(/figure\[_ngcontent[^\]]+\]img\[_ngcontent[^\]]+\]\{aspect-ratio:1024\/683/);
    expect(imageRule).toContain('height:auto');
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
    expect(actions).toHaveLength(2);
    expect(actions[0].getAttribute('href')).toBe('/cursos');
    expect(actions[0].textContent?.trim()).toBe('Nuestros cursos');
    const externo = actions[1]!;
    expect(externo.getAttribute('href')).toBe('https://acordesgaditanos.com/');
    expect(externo.getAttribute('target')).toBe('_blank');
    expect(externo.getAttribute('rel')).toBe('noopener noreferrer');
    expect(externo.textContent?.trim()).toBe('Acordes Gaditanos');
    expect(externo.getAttribute('aria-label')).toContain('Acordes Gaditanos');
    expect(externo.classList.contains('quiet')).toBe(true);
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

  it('no muestra testimonios vacíos ni el recorrido eliminado', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-section="testimonios"]')).toBeNull();
    expect(root.querySelector('[data-section="preview"]')).toBeNull();
    expect(root.querySelector('blockquote')).toBeNull();
  });

  it('muestra el nombre definitivo del profesor con subtítulo y texto de ejemplo', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    expect(teacher.querySelector('h2')?.textContent?.trim()).toBe('Tu profesor');
    expect(teacher.querySelector('.home-teacher__text h2.chapter')).not.toBeNull();
    expect(teacher.querySelector('.name')?.textContent?.trim())
      .toBe('Pablo Franco Toscano');
    expect(teacher.querySelector('.home-teacher__role')?.textContent?.trim())
      .toBe('Profesor de guitarra de conservatorio');
    expect(teacher.querySelector('.home-teacher__bio')?.textContent)
      .toContain('repertorio del Carnaval de Cádiz');
    expect(teacher.textContent).not.toContain('Contenido de muestra · pendiente de sustituir');
    expect(teacher.textContent).not.toContain('Foto de muestra · se sustituirá por la imagen definitiva');
    expect(teacher.textContent).not.toContain('Profesor de muestra');
  });

  it('usa la imagen local aportada sin inventar credenciales, correos ni testimonios', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    const image = teacher.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('images/profesor.webp');
    const alt = (image?.getAttribute('alt') ?? '').trim();
    expect(alt).toContain('Fotografía aportada');

    const text = teacher.textContent ?? '';
    expect(text).not.toContain('@');
    expect(text).not.toMatch(/licenciado|graduado|certificado|titulado|años de experiencia|premio/i);
    expect(teacher.querySelector('blockquote')).toBeNull();
  });

  it('coloca el texto del profesor antes de la imagen y mantiene dos columnas en escritorio', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    const children = Array.from(teacher.querySelectorAll<HTMLElement>('.home-teacher__grid > *'));
    const visualIndex = children.findIndex((element) => element.classList.contains('home-teacher__visual'));
    const textIndex = children.findIndex((element) => element.classList.contains('home-teacher__text'));
    expect(visualIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeGreaterThanOrEqual(0);
    expect(textIndex).toBeLessThan(visualIndex);

    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');
    expect(styles).toContain('grid-template-columns:minmax(0,42fr)minmax(0,58fr)');
    expect(styles).toContain('grid-template-columns:minmax(0,1fr)');
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
    expect(root.querySelector('[data-section=cta]')).not.toBeNull();
  });

  it('asocia cada sección con su encabezado mediante aria-labelledby', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    for (const section of Array.from(root.querySelectorAll<HTMLElement>('section[data-section]'))) {
      const labelledBy = section.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(section.querySelector(`h1#${labelledBy}, h2#${labelledBy}`)).not.toBeNull();
    }
  });

  it('aplica el mínimo táctil y reserva las transiciones al movimiento permitido', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const styles = cssText();
    expect(styles).toContain('min-height:var(--tap-min)');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('outline:var(--focus-ring)solidvar(--focus)');
    const motion = styles.indexOf('@media(prefers-reduced-motion:no-preference)');
    expect(motion).toBeGreaterThan(-1);
    expect(styles.slice(motion)).toContain('transition:');
    expect(ruleFor(styles, 'home-card')).not.toContain('transition:');
  });

  it('mantiene la jerarquía de encabezados y las cuatro materias', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([course('1', 'curso', 'Curso')]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4'), h => Number(h.tagName.slice(1)));
    expect(headings[0]).toBe(1);
    expect(headings.slice(1).every((level, i) => level <= headings[i] + 1)).toBe(true);
    expect(root.querySelectorAll('[data-section="aprenderas"] ul > li')).toHaveLength(4);
    expect(root.querySelector('[data-section="preview"]')).toBeNull();
  });

  it('admite títulos largos y conserva el ancho disponible para el foco en móvil', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const styles = cssText();
    expect(styles).toContain('overflow-wrap:anywhere');
    expect(styles).toContain('minmax(0,1fr)');
    expect(styles).not.toContain('width:100vw');
    expect(styles).not.toContain('overflow-x:hidden');
    expect(styles).toContain('max-width:100%');
    expect(styles).toContain('aspect-ratio:2.5');
    expect(styles).toContain('object-fit:cover');
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

  it('anuncia un fallo del catálogo sin perder el encabezado ni la salida al catálogo', async () => {
    const fixture = setup({ list: vi.fn().mockRejectedValue(new Error('failed')), detail: noDetail() });
    await fixture.whenStable();
    const section = (fixture.nativeElement as HTMLElement).querySelector('[data-section="cursos"]')!;
    expect(section.querySelector('[role="alert"]')?.textContent).toContain('No se han podido cargar los cursos');
    expect(section.querySelector(`h2#${section.getAttribute('aria-labelledby')}`)).not.toBeNull();
    expect(section.querySelector('a[href="/cursos"]')).not.toBeNull();
    expect(section.querySelector('.home-cards')).toBeNull();
  });
});
