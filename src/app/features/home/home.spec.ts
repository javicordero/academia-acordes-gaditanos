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
      const link = card.querySelector<HTMLAnchorElement>('a.home-card__link')!;
      expect(link.getAttribute('href')).toBe('/cursos');
      expect(link.getAttribute('aria-label')).toBe('Ver catálogo de cursos');
      expect(card.querySelector('.home-button')?.textContent?.trim()).toBe('Ver catálogo');
    }
    expect(segundo.textContent).not.toContain('De muestra');
    expect(segundo.querySelectorAll('.home-card__level')).toHaveLength(0);
    expect(segundo.querySelectorAll('a[href^="/cursos/"]')).toHaveLength(0);
  });

  it('declara tres columnas en escritorio y 2+1 en móvil con fuentes y miniaturas reducidas', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();

    const styles = cssText();
    expect(styles).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
    expect(ruleFor(styles, 'home-card__image')).toContain('object-fit:cover');
    // La miniatura es proporcional al ancho, no una altura fija de 80 px.
    expect(ruleFor(styles, 'home-card__image')).toContain('height:clamp(3.5rem,8vw,6rem)');
    expect(ruleFor(styles, 'home-card__course')).toContain('font-size:var(--font-size-lg)');
    expect(styles).toContain('font-size:var(--font-size-md)');
    expect(ruleFor(styles, 'home-divider')).toMatch(/margin-block:var\(--[a-z-]+\)/);
    expect(styles).not.toContain('margin-top:calc(var(--space-5)+var(--space-4))');
    expect(styles).toMatch(/\.home-section\[_ngcontent[^\]]+\]h2\[_ngcontent[^\]]+\]\{margin:0\s*0\s*var\(--space-4\)/);
    expect(styles).not.toContain('margin-top:2.25rem');

    const inicio = styles.indexOf('@media(max-width:48rem)');
    const fin = styles.indexOf('@media(prefers-reduced-motion');
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const movil = styles.slice(inicio, fin);
    expect(movil).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(movil).toContain('grid-column:1/-1');
    expect(movil).toContain('justify-self:center');
    expect(movil).not.toContain('font-size:var(--font-size-sm)');
    // Tamaño de imagen en escritorio y una reducción en el media estrecho.
    expect(styles.match(/height:clamp\(3\.5rem,8vw,/g) ?? []).toHaveLength(1);
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
    // Sangrado compensado con calc (regla declarada), no ancho de viewport.
    expect(ruleFor(styles, 'home')).toMatch(/margin:calc\(/);
    expect(styles).toContain('width:auto');
    expect(styles).not.toContain('width:100vw');
    expect(styles).toContain('overflow-x:clip');
    expect(styles).toContain('padding-inline:clamp(1.25rem,5vw,3rem)');
    expect(styles).toContain('padding-block:var(--section-gap)');
    expect(styles).toContain('max-width:var(--content-max-width)');
    expect(styles).toContain('margin-inline:auto');
    for (const name of ['hero', 'cursos', 'aprenderas', 'preview', 'profesor', 'testimonios', 'cta']) {
      expect(section(name).querySelector('.home-inner')).not.toBeNull();
    }
    const homeRule = styles.match(/\.home\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    expect(homeRule).not.toContain('max-width');
    expect(homeRule).toContain('-1.25rem');
    expect(homeRule).not.toContain('100vw');
    expect(styles).toContain('border-bottom:var(--border-width)solidvar(--border)');
    expect(styles).toContain('border-top:var(--border-width)solidvar(--border)');
    expect(styles).toContain('background:var(--bg)');
    expect(styles).toContain('background:var(--surface)');
  });

  it('tiñe el hero con tokens, centra el divisor y deja el espaciado de listas a la rejilla', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');

    const heroRule = styles.match(/\.home-hero\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    const dividerRule = styles.match(/\.home-divider\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    const cardsRule = styles.match(/\.home-cards\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    const cardRule = styles.match(/\.home-card\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    const titleRule = styles.match(/\.home-section\[_ngcontent[^\]]+\]h2\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    const linkRule = styles.match(/\.home-card__link\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    const courseRule = styles.match(/\.home-card__course\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';

    // Fondo del hero derivado de tokens del tema, no blanco liso; conserva su línea.
    expect(heroRule).not.toContain('background:var(--surface)');
    expect(heroRule).toContain('color-mix(');
    expect(heroRule).toContain('var(--accent)');
    expect(heroRule).toContain('var(--surface)');
    expect(heroRule).toContain('border-bottom:var(--border-width)solidvar(--border)');

    // Divisor integrado en la escala de la rejilla, con la misma separación a ambos lados.
    expect(dividerRule).toMatch(/margin-block:var\(--grid-gap\)/);
    expect(dividerRule).not.toContain('margin-top');
    expect(dividerRule).not.toContain('margin-bottom');
    expect(dividerRule.match(/margin-block:var\([^)]+\)/g) ?? []).toHaveLength(1);
    // La línea abarca todo el contenido, no un trozo centrado.
    expect(dividerRule).toContain('width:100%');
    expect(dividerRule).not.toContain('max-width:');
    expect(dividerRule).not.toContain('margin-inline:');
    expect(dividerRule).not.toContain('width:min(');

    // El hueco entre tarjetas lo pone gap, no márgenes de ul/li ni del título.
    expect(cardsRule).toContain('gap:var(--grid-gap)');
    expect(cardsRule).toContain('margin:0');
    expect(cardsRule).toContain('padding:0');
    expect(cardsRule).toContain('list-style:none');
    expect(cardRule).toContain('margin:0');
    expect(titleRule).toMatch(/^margin:0\s*0\s*var\(--space-4\)/);
    expect(titleRule).toContain('font-size:var(--font-size-2xl)');

    // Enlace estirado, título en tinta y botón compacto de tarjeta.
    expect(linkRule).toContain('position:absolute');
    expect(linkRule).toContain('inset:0');
    expect(linkRule).toContain('z-index:1');
    expect(courseRule).toContain('color:var(--ink)');
    expect(courseRule).not.toContain('var(--accent)');
    // Un solo padding de botón en toda la portada: la tarjeta no lo redefine.
    expect(styles).not.toMatch(/\.home-card\[_ngcontent[^\]]+\]\.home-button/);
    expect(ruleFor(styles, 'home-button')).toContain('margin:auto');

    // Hover solo en la card: borde y sombra suave, sin mover ni teñir el primary.
    expect(styles).toMatch(/\.home-card\[_ngcontent[^\]]+\]:is\(:hover,:focus-within\)\{[^}]*box-shadow:var\(--shadow-card\)/);
    expect(styles).toContain('border-color:var(--accent)');
    expect(styles).not.toContain('transform:translateY');
    expect(styles).toMatch(/\.home-button--primary\[_ngcontent[^\]]+\](?:,\.home-button--primary\[_ngcontent[^\]]+\]:hover)?\{background:var\(--accent\);color:var\(--accent-ink\);?\}/);

    // Los CTAs del hero comparten medidas; solo cambia el color.
    const actionsRule = ruleFor(styles, 'home-button');
    expect(actionsRule).toContain('min-height:var(--tap-min)');
    expect(actionsRule).toMatch(/padding:var\(--space-\d+\)var\(--space-\d+\)/);
    expect(actionsRule).toContain('font-size:var(--font-size-md)');
    expect(actionsRule).toContain('font-weight:var(--weight-bold)');
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

  it('equilibra las tarjetas con imagen a borde, columna flex y botón abajo', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');

    const rule = (selector: RegExp): string => styles.match(selector)?.[1] ?? '';
    const cardRule = rule(/\.home-card\[_ngcontent[^\]]+\]\{([^}]*)\}/);
    const coverRule = rule(/\.home-card__cover\[_ngcontent[^\]]+\]\{([^}]*)\}/);
    const imageRule = rule(/\.home-card__image\[_ngcontent[^\]]+\]\{([^}]*)\}/);
    const courseRule = rule(/\.home-card__course\[_ngcontent[^\]]+\]\{([^}]*)\}/);

    expect(cardRule).toContain('display:flex');
    expect(cardRule).toContain('flex-direction:column');
    expect(cardRule).toContain('height:100%');
    expect(coverRule).not.toContain('padding');
    expect(imageRule).not.toContain('padding');
    expect(imageRule).toContain('object-fit:cover');
    expect(imageRule).toContain('height:clamp(3.5rem,8vw,6rem)');
    expect(courseRule).toContain('min-height:');
    expect(courseRule).toContain('line-height:var(--line-height-tight)');
    expect(courseRule).toContain('font-size:var(--font-size-lg)');
    expect(courseRule).toContain('font-weight:var(--weight-bold)');
    expect(ruleFor(styles, 'home-button')).toContain('margin:auto');
    expect(styles).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
    for (const card of Array.from(root.querySelectorAll('.home-card'))) {
      expect(card.querySelectorAll('a')).toHaveLength(1);
    }
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

  it('aplica el tercer color solo al CTA principal del hero, sin afectar a tarjetas ni al CTA final', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const styles = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');

    // El único elemento con el color strong es el primary del hero, en reposo y hover.
    const heroPrimary = styles.match(
      /\.home-hero\[_ngcontent[^\]]+\]\.home-button--primary\[_ngcontent[^\]]+\](?:,\.home-hero\[_ngcontent[^\]]+\]\.home-button--primary\[_ngcontent[^\]]+\]:hover)?\{([^}]*)\}/,
    )?.[1] ?? '';
    expect(heroPrimary).toContain('background:var(--accent-strong)');
    expect(heroPrimary).toContain('color:var(--accent-strong-ink)');
    expect(heroPrimary).not.toContain('filter');
    expect(styles.match(/background:var\(--accent-strong\)/g) ?? []).toHaveLength(1);
    expect(styles.match(/color:var\(--accent-strong-ink\)/g) ?? []).toHaveLength(1);

    // El primary general (tarjetas y CTA final) sigue azul, sin el token strong.
    expect(styles).toMatch(/\.home-button--primary\[_ngcontent[^\]]+\](?:,\.home-button--primary\[_ngcontent[^\]]+\]:hover)?\{background:var\(--accent\);color:var\(--accent-ink\);?\}/);

    // El enlace externo sigue siendo secondary; foco y tamaño intactos.
    const hero = root.querySelector<HTMLElement>('[data-section="hero"]')!;
    const primary = hero.querySelector<HTMLAnchorElement>('.home-button--primary')!;
    expect(primary.textContent?.trim()).toBe('Nuestros cursos');
    expect(hero.querySelector('.home-button--secondary')?.textContent?.trim())
      .toBe('Acordes Gaditanos');
    expect(ruleFor(styles, 'home-button')).toContain('min-height:var(--tap-min)');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('outline:var(--focus-ring)solidvar(--focus)');
  });

  it('unifica padding de botón, ritmo vertical y divisor con tokens, sin filtros de color', async () => {
    const fixture = setup({
      list: vi.fn().mockResolvedValue([course('1', 'curso-uno', 'Curso uno')]),
      detail: noDetail(),
    });
    await fixture.whenStable();
    const styles = cssText();

    // Un solo padding para todos los botones; la tarjeta no redefine el suyo.
    const buttonRule = ruleFor(styles, 'home-button');
    expect(buttonRule).toMatch(/padding:var\(--space-\d+\)var\(--space-\d+\)/);
    expect(styles).not.toMatch(/\.home-card\[_ngcontent[^\]]+\]\.home-button/);

    // El primary no cambia de color al hover: sin filtros, feedback por foco y tamaño.
    expect(styles).not.toMatch(/filter:brightness/);
    expect(styles).not.toMatch(/\.home-card[^{]*\{[^}]*filter:/);

    // Ritmo vertical común, sin anulación local en el CTA final.
    expect(styles).toContain('padding-block:var(--section-gap)');
    expect(styles).not.toMatch(/\.home-cta\[_ngcontent/);
    expect(ruleFor(styles, 'home-divider')).toMatch(/margin-block:var\(--grid-gap\)/);

    // Tokens de accesibilidad en lugar de literales.
    expect(buttonRule).toContain('min-height:var(--tap-min)');
    expect(styles).not.toContain('min-height:44px');
    expect(styles).toContain('outline:var(--focus-ring)solidvar(--focus)');
    expect(styles).not.toContain('outline:3px');

    // Guardas de ancho para que el CTA no desborde la tarjeta estrecha.
    expect(buttonRule).toContain('min-width:0');
    expect(buttonRule).toContain('max-width:100%');
    expect(buttonRule).toContain('flex-wrap:wrap');
    expect(styles).not.toMatch(/@media\(max-width:20rem\)\{[^}]*\.home-button/);
  });

  it('muestra la imagen del profesor sin distorsión y con pie accesible', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const teacher = root.querySelector<HTMLElement>('[data-section="profesor"]')!;
    const figure = teacher.querySelector<HTMLElement>('figure.home-teacher__visual')!;
    const image = figure.querySelector<HTMLImageElement>('img.home-teacher__image')!;
    const caption = figure.querySelector<HTMLElement>('figcaption.home-teacher__caption')!;

    expect(figure.contains(image)).toBe(true);
    expect(figure.contains(caption)).toBe(true);
    expect(image.getAttribute('width')).toBe('480');
    expect(image.getAttribute('height')).toBe('560');
    expect(caption.textContent?.trim()).toMatch(/muestra/);

    const styles = cssText();
    const imageRule = ruleFor(styles, 'home-teacher__image');
    expect(imageRule).toContain('object-fit:cover');
    expect(imageRule).not.toContain('object-fit:fill');
    expect(imageRule).toContain('aspect-ratio:6/7');
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
    expect(externo.classList.contains('home-button--secondary')).toBe(true);
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
    expect(styles).toContain('clamp(3.5rem,8vw,6rem)');
    expect(styles).toContain('min-height:var(--tap-min)');
    expect(styles).toContain('outline:var(--focus-ring)solidvar(--focus)');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('prefers-reduced-motion');
    expect(styles).toContain('aspect-ratio');
    // Geometría gobernada por tokens de tema: cambia de tema sin recargar.
    for (const token of ['--content-max-width', '--section-gap', '--grid-gap', '--card-pad', '--border-width', '--radius-md', '--tap-min', '--focus-ring']) {
      expect(styles).toContain(`var(${token}`);
    }
  });

  it('aplica la escala tipográfica con tokens: h1 3xl, h2 2xl, h3 lg, cuerpo md y small sm', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const styles = cssText();

    const h1 = styles.match(/\.home-hero\[_ngcontent[^\]]+\]h1\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    const h2 = styles.match(/\.home-section\[_ngcontent[^\]]+\]h2\[_ngcontent[^\]]+\]\{([^}]*)\}/)?.[1] ?? '';
    expect(h1).toContain('font-size:var(--font-size-3xl)');
    expect(h1).toContain('line-height:var(--line-height-tight)');
    expect(h2).toContain('font-size:var(--font-size-2xl)');
    expect(h2).toContain('line-height:var(--line-height-tight)');
    expect(h2).toMatch(/^margin:0\s*0\s*var\(--space-4\)/);
    expect(ruleFor(styles, 'home-card__course')).toContain('font-size:var(--font-size-lg)');
    expect(ruleFor(styles, 'home-card__course')).not.toContain('font-size:var(--font-size-md)');
    expect(ruleFor(styles, 'home')).toContain('font-size:var(--font-size-md)');
    expect(ruleFor(styles, 'home-lead')).toContain('line-height:var(--line-height-relaxed)');
    expect(ruleFor(styles, 'home-teacher__caption')).toContain('font-size:var(--font-size-sm)');
  });

  it('usa cubierta proporcional y unidad de espacio en secciones sin desbordar a 320px', async () => {
    const fixture = setup({ list: vi.fn().mockResolvedValue([]), detail: noDetail() });
    await fixture.whenStable();
    const styles = cssText();

    expect(ruleFor(styles, 'home-card__image')).toContain('height:clamp(3.5rem,8vw,6rem)');
    expect(styles).not.toContain('height:80px');
    expect(styles).toMatch(/\.home-hero\[_ngcontent[^\]]+\],\.home-section\[_ngcontent[^\]]+\]\{padding-block:var\(--section-gap\);?\}/);
    expect(styles).not.toMatch(/\.home-cta\[_ngcontent/);
    expect(styles).not.toContain('padding-block:var(--card-pad)');
    expect(ruleFor(styles, 'home')).toContain('overflow-x:clip');
    expect(ruleFor(styles, 'home-inner')).toContain('padding-inline:clamp(1.25rem,5vw,3rem)');
    const button = ruleFor(styles, 'home-button');
    expect(button).toContain('min-width:0');
    expect(button).toContain('max-width:100%');
    expect(button).toContain('flex-wrap:wrap');
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
