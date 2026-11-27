import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import { Cursos } from './cursos';
import { PublicCourse, PublicCoursesRepository } from './public-courses-repository';
import { readFileSync } from 'node:fs';

const cursosStyles = readFileSync('src/app/features/cursos/cursos.scss', 'utf8');

describe('Catálogo', () => {
  it('presenta texto escapado y enlace a la ficha', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'ejemplo', title: '<script>texto</script>', summary: null, level: 'basico' },
      ]) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<script>texto</script>');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/cursos/ejemplo');
  });
  it('muestra error y reintento', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockRejectedValue(new Error('failed')) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
  });

  it('no pisa la respuesta reciente con una carga antigua al reintentar', async () => {
    const antiguo: PublicCourse = { id: '1', slug: 'antiguo', title: 'Antiguo', summary: null, description: null, level: 'basico' };
    const nuevo: PublicCourse = { id: '2', slug: 'nuevo', title: 'Nuevo', summary: null, description: null, level: 'basico' };
    let resolveAntiguo: (value: PublicCourse[]) => void;
    let resolveNuevo: (value: PublicCourse[]) => void;
    const primera = new Promise<PublicCourse[]>((resolve) => { resolveAntiguo = resolve; });
    const segunda = new Promise<PublicCourse[]>((resolve) => { resolveNuevo = resolve; });
    const list = vi.fn().mockReturnValueOnce(primera).mockReturnValueOnce(segunda);
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    const component = fixture.componentInstance;
    // El constructor ya lanzó la primera carga; simular un reintento (segunda carga).
    const recarga = component.load();

    // La respuesta reciente (segunda) llega antes y se aplica.
    resolveNuevo!([nuevo]);
    await recarga;
    expect(component.courses()).toEqual([nuevo]);

    // La respuesta antigua (primera) llega después y no debe sobrescribirla.
    resolveAntiguo!([antiguo]);
    await primera;
    await fixture.whenStable();
    expect(component.courses()).toEqual([nuevo]);
  });

  it('con el flag apagado no ofrece compra desde el catálogo', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'ejemplo', title: 'Ejemplo', summary: null, level: 'basico' },
      ]) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Modo de prueba');
    expect(root.querySelector('app-checkout-button')?.textContent?.trim()).toBe('');
    expect(root.querySelector('app-checkout-button a')).toBeNull();
  });

  it('con el flag activo muestra el aviso y enlaza cada curso a su ficha con intención', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: true } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'ejemplo', title: 'Ejemplo', summary: null, level: 'basico' },
      ]) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Modo de prueba — no se realizan cobros reales');
    const href = root.querySelector('app-checkout-button a')?.getAttribute('href') ?? '';
    const parsed = new URL(href, 'https://interno.test');
    expect(parsed.pathname).toBe('/cursos/ejemplo');
    expect(parsed.searchParams.get('comprar')).toBe('1');
  });

  const publicados: PublicCourse[] = [
    { id: '1', slug: 'ritmos', title: 'Ritmos', summary: 'Resumen de ritmos', description: null, level: 'basico' },
    { id: '2', slug: 'punteos', title: 'Punteos', summary: null, description: null, level: 'iniciacion' },
  ];

  async function renderCatalog(courses: PublicCourse[] = publicados, checkoutTestEnabled = false) {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockResolvedValue(courses) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('estructura la página en cabecera, filtros etiquetados y lista semántica', async () => {
    const fixture = await renderCatalog();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('header.catalog-header h1')?.textContent?.trim()).toBe('Cursos');
    expect(root.querySelector('.catalog-header .eyebrow')?.textContent?.trim()).toBe('Catálogo');
    expect(root.querySelector('.catalog-header .lead')?.textContent).toContain('Explora los cursos publicados');
    expect(root.querySelector('section.catalog')?.getAttribute('aria-labelledby')).toBe('catalog-title');
    expect(root.querySelector('#catalog-title')?.tagName).toBe('H1');
    expect(root.querySelector('[role="search"]')).not.toBeNull();
    expect(root.querySelector('label[for="filtro-busqueda"]')?.textContent?.trim()).toBe('Buscar cursos');
    expect(root.querySelector('#filtro-busqueda')?.getAttribute('type')).toBe('search');
    expect(root.querySelector('label[for="filtro-nivel"]')?.textContent?.trim()).toBe('Nivel');
    const level = root.querySelector('#filtro-nivel') as HTMLSelectElement;
    expect(Array.from(level.options).map((option) => option.value)).toEqual(['', 'iniciacion', 'basico', 'intermedio']);
    const list = root.querySelector('ul.cards');
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll('li.cards__item')).toHaveLength(2);
    expect(list?.querySelectorAll('app-course-card')).toHaveLength(2);
  });

  it('conserva el orden del repositorio y la jerarquía visual de cada tarjeta', async () => {
    const fixture = await renderCatalog();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('app-course-card'));
    expect(cards.map((card) => card.querySelector('.card__title')?.textContent?.trim())).toEqual(['Ritmos', 'Punteos']);
    expect(cards[0].querySelector('.card__level')?.textContent?.trim()).toBe('Básico');
    expect(cards[0].querySelector('.card__visual')?.getAttribute('aria-hidden')).toBe('true');
    expect(cards[0].querySelector('.card__summary')?.textContent?.trim()).toBe('Resumen de ritmos');
    expect(cards[1].querySelector('.card__summary')).toBeNull();
    expect(cards[0].querySelector('.card__view')?.textContent?.trim()).toBe('Ver curso');
  });

  it('filtra por búsqueda y nivel sin robar el foco y anuncia solo el resultado vacío', async () => {
    const fixture = await renderCatalog();
    const root = fixture.nativeElement as HTMLElement;
    const search = root.querySelector('#filtro-busqueda') as HTMLInputElement;
    const level = root.querySelector('#filtro-nivel') as HTMLSelectElement;
    expect(search.hasAttribute('autofocus')).toBe(false);
    expect(level.hasAttribute('autofocus')).toBe(false);
    expect(root.querySelector('.empty')).toBeNull();

    search.value = 'punteos';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelectorAll('app-course-card')).toHaveLength(1);
    expect(root.querySelector('.card__title')?.textContent?.trim()).toBe('Punteos');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    level.value = 'basico';
    level.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelectorAll('app-course-card')).toHaveLength(1);
    expect(root.querySelector('.card__title')?.textContent?.trim()).toBe('Ritmos');

    level.value = 'intermedio';
    level.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelectorAll('app-course-card')).toHaveLength(0);
    expect(root.querySelector('.empty[role="status"]')?.textContent).toContain('No hay cursos que coincidan con los filtros.');
    expect(document.activeElement).not.toBe(search);
  });

  it('sustituye el texto de carga por un esqueleto con un único aviso accesible', async () => {
    let resolveList!: (value: PublicCourse[]) => void;
    const pending = new Promise<PublicCourse[]>((resolve) => { resolveList = resolve; });
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockReturnValue(pending) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('card');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando cursos');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[autofocus]')).toBeNull();
    resolveList([]);
    await pending;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('mantiene los roles de estado y el objetivo táctil del reintento', async () => {
    let resolveList!: (value: PublicCourse[]) => void;
    const pending = new Promise<PublicCourse[]>((resolve) => { resolveList = resolve; });
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockReturnValue(pending) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('p[role="status"]')?.textContent).toContain('Cargando cursos');
    resolveList([]);
    await pending;
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.state')?.textContent).toContain('No hay cursos publicados');
  });

  it('declara la rejilla responsive de una, dos y tres columnas', () => {
    expect(cursosStyles).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(cursosStyles).toMatch(/@media\s*\(min-width:\s*48rem\)[\s\S]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(cursosStyles).toMatch(/@media\s*\(min-width:\s*64rem\)[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(cursosStyles).toContain('--catalog-field-min: 44px');
  });

  it('gobierna la geometría de filtros y rejilla con tokens de tema', () => {
    for (const token of ['--section-gap', '--grid-gap', '--card-pad', '--border-width', '--radius-sm']) {
      expect(cursosStyles).toContain(`var(${token}`);
    }
    expect(cursosStyles).not.toContain('--catalog-gap:');
  });

  it('los filtros no son una card: espacio y línea fina en lugar de caja, fondo y radio', () => {
    const rules = cursosStyles.match(/\.filters\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rules).toContain('padding-block: var(--card-pad)');
    expect(rules).toContain('border-top: var(--border-width) solid var(--border)');
    expect(rules).not.toContain('background: var(--surface)');
    expect(rules).not.toContain('border-radius');
    expect(rules).not.toContain('border: var(--border-width)');
    const header = cursosStyles.match(/\.catalog-header\s*\{[^}]*\}/)?.[0] ?? '';
    expect(header).toContain('padding-block: var(--section-gap)');
  });

  it('no añade precios, profesor ni testimonios al catálogo', async () => {
    const fixture = await renderCatalog(publicados, true);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/\d+\s*€|EUR|profesor|testimonio/i);
  });
});
