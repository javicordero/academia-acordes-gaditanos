import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ClassroomNav } from './classroom-nav';

/** Estilos inyectados por Angular como <style>: comprobar la regla declarada evita
 *  depender de que jsdom aplique media queries o calcule píxeles. */
function componentCss(): string {
  return [...document.querySelectorAll('style')].map(s => s.textContent ?? '').join('\n');
}

describe('Índice del aula', () => {
  async function setup(contentType: 'pdf' | 'video' = 'pdf', completedIds: ReadonlySet<string> | null = null) {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('teacher', 'Docente');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', [{ id: 'l', section_id: 's', title: 'Lección', slug: 'leccion', content_type: contentType }]);
    fixture.componentRef.setInput('activeId', 'l');
    if (completedIds !== null) fixture.componentRef.setInput('completedIds', completedIds);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('identifica la lección activa, el docente y despliega los bloques por defecto', async () => {
    const { root } = await setup();
    expect(root.querySelector('a[aria-current="page"]')?.textContent).toContain('Lección');
    // El tipo de recurso ya no se etiqueta: no queda huella de «PDF» en la fila.
    expect(root.querySelector('a[aria-current="page"]')?.textContent).not.toContain('PDF');
    expect(root.querySelector('a[aria-current="page"] .lesson-icon')).toBeNull();
    expect(root.textContent).toContain('Docente');
    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('bloque-s');
    expect(root.querySelector('#bloque-s')).not.toBeNull();
  });

  it('los bloques son plegables con aria-expanded y aria-controls', async () => {
    const { fixture, root } = await setup();
    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    const list = root.querySelector<HTMLElement>('#bloque-s')!;
    expect(root.querySelector('.block-toggle__folder')).toBeNull();
    expect(toggle.querySelector('.block-toggle__title')?.textContent).toBe('Bloque');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
  });

  it('el hamburger es alcanzable, nombra el cajón y abre el índice móvil', async () => {
    const { fixture, root } = await setup();
    const button = root.querySelector<HTMLButtonElement>('.menu')!;
    const nav = root.querySelector<HTMLElement>('nav')!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toContain('Lecciones del curso');
    expect(button.getAttribute('aria-controls')).toBe(nav.id);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(nav.classList.contains('open')).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(nav.classList.contains('open')).toBe(true);
    // Sin backdrop: el propio hamburger queda como cierre visible sobre el cajón.
    expect(root.querySelector('.nav-backdrop')).toBeNull();
    expect(button.classList.contains('menu--open')).toBe(true);
  });

  it('Escape en el botón de apertura cierra el índice sin robar el foco y no opera si ya está cerrado', async () => {
    const { fixture, root } = await setup('video');
    const button = root.querySelector<HTMLButtonElement>('.menu')!;
    const nav = root.querySelector<HTMLElement>('nav')!;

    button.focus();
    expect(document.activeElement).toBe(button);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(button);

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);

    const link = nav.querySelector<HTMLAnchorElement>('a')!;
    link.focus();
    expect(document.activeElement).toBe(link);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(link);
  });

  it('Escape desde cualquier punto del documento cierra el cajón y devuelve el foco al hamburger', async () => {
    const { fixture, root } = await setup();
    const button = root.querySelector<HTMLButtonElement>('.menu')!;
    button.click();
    fixture.detectChanges();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('bloquea el scroll del documento con el cajón abierto y lo restaura al cerrarlo', async () => {
    const { fixture, root } = await setup();
    const button = root.querySelector<HTMLButtonElement>('.menu')!;
    expect(document.body.style.overflow).toBe('');
    button.click();
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');
    button.click();
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('');
  });

  it('al elegir una lección se cierra el cajón y el foco no queda atrapado en el índice', async () => {
    const { fixture, root } = await setup();
    const button = root.querySelector<HTMLButtonElement>('.menu')!;
    button.click();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const link = root.querySelector<HTMLAnchorElement>('a[aria-current="page"]')!;
    link.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(button);
  });

  it('el hamburger lleva el icono a la izquierda y conserva nombre accesible', async () => {
    const { root } = await setup('video');
    const button = root.querySelector<HTMLButtonElement>('.menu')!;
    expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(button.querySelector('svg.menu__icon')).not.toBeNull();
    expect(button.querySelector('.menu__label')?.textContent).toContain('Lecciones del curso');
    expect(button.getAttribute('aria-label')).toBe('Lecciones del curso');
    expect(button.getAttribute('title')).toBe('Lecciones del curso');
  });

  it('el cajón se cierra con el propio hamburger visible y devuelve el foco, sin X ni backdrop', async () => {
    const { fixture, root } = await setup();
    const menu = root.querySelector<HTMLButtonElement>('.menu')!;
    expect(root.querySelector('.nav-close')).toBeNull();
    expect(root.querySelector('.nav-backdrop')).toBeNull();
    expect(menu.getAttribute('aria-label')).toBe('Lecciones del curso');
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    menu.focus(); // jsdom no enfoca con .click(): se simula el foco real del botón.
    menu.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(menu.classList.contains('menu--open')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // El mismo botón, ahora visible sobre el cajón, es el cierre accesible.
    menu.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(menu.classList.contains('menu--open')).toBe(false);
    expect(document.activeElement).toBe(menu);
    expect(document.body.style.overflow).toBe('');
  });

  it('la cabecera de bloque muestra solo título y chevron, sin carpeta, y el chevron sigue plegando', async () => {
    const { fixture, root } = await setup('video');
    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    const chevron = toggle.querySelector<HTMLElement>('.block-toggle__chevron')!;
    expect(root.querySelector('.block-toggle__folder')).toBeNull();
    expect(chevron.textContent).toBe('▾');
    expect(toggle.querySelectorAll('svg').length).toBe(0);
    expect(root.querySelector('.lesson-icon')).toBeNull();
    expect(root.querySelector('.sr-only')).toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(chevron.textContent).toBe('▸');
  });

  it('el botón de bloque nombra solo el título y oculta el chevron decorativo', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Praiafa' }]);
    fixture.componentRef.setInput('lessons', []);
    fixture.componentRef.setInput('activeId', '');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    const chevron = toggle.querySelector<HTMLElement>('.block-toggle__chevron')!;

    expect(toggle.getAttribute('aria-label')).toBe('Praiafa');
    expect(chevron.textContent).toBe('▾');
    expect(chevron.getAttribute('aria-hidden')).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('bloque-s');
  });

  it('la fila de vídeo no muestra icono ni etiqueta de tipo de recurso', async () => {
    const { root } = await setup('video');
    expect(root.querySelector('.lesson-icon')).toBeNull();
    expect(root.textContent).not.toContain('Vídeo:');
  });

  it('la fila de PDF no muestra icono ni etiqueta de tipo de recurso', async () => {
    const { root } = await setup('pdf');
    expect(root.querySelector('.lesson-icon svg path[d^="M4 2h5"]')).toBeNull();
    expect(root.querySelector('.lesson-icon')).toBeNull();
    expect(root.textContent).not.toContain('PDF:');
  });

  it('elegir lección en el cajón devuelve el foco al hamburger y mueve aria-current sin recrear el nav', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    const lessons = [
      { id: 'l1', section_id: 's', title: 'Primera', slug: 'uno', content_type: 'video' as const },
      { id: 'l2', section_id: 's', title: 'Segunda', slug: 'dos', content_type: 'video' as const },
    ];
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', lessons);
    fixture.componentRef.setInput('activeId', 'l1');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const menu = root.querySelector<HTMLButtonElement>('.menu')!;
    const navNode = root.querySelector('nav')!;
    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    menu.click(); fixture.detectChanges();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const second = [...root.querySelectorAll<HTMLAnchorElement>('li a')]
      .find(a => a.textContent?.includes('Segunda'))!;
    second.click(); fixture.detectChanges();
    fixture.componentRef.setInput('activeId', 'l2');
    fixture.detectChanges();

    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
    expect(root.querySelector('nav')).toBe(navNode);
    expect(root.querySelector('a[aria-current="page"]')?.textContent).toContain('Segunda');
    expect(root.querySelector<HTMLButtonElement>('.block-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('muestra solo el icono de progreso al inicio de la fila, con nombre accesible sr-only', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    const lessons = [
      { id: 'l1', section_id: 's', title: 'Primera', slug: 'uno', content_type: 'video' as const },
      { id: 'l2', section_id: 's', title: 'Segunda', slug: 'dos', content_type: 'pdf' as const },
    ];
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', lessons);
    fixture.componentRef.setInput('activeId', 'l1');
    fixture.componentRef.setInput('completedIds', new Set(['l1']));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('li a')];
    expect(links.length).toBe(2);

    const first = links[0].querySelector<HTMLElement>('.lesson-progress')!;
    const second = links[1].querySelector<HTMLElement>('.lesson-progress')!;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // El estado ocupa el hueco del antiguo icono de tipo: primer hijo y antes del título.
    expect(links[0].firstElementChild).toBe(first);
    expect(links[1].firstElementChild).toBe(second);
    expect(first.nextElementSibling?.classList.contains('lesson-title')).toBe(true);
    expect(second.nextElementSibling?.classList.contains('lesson-title')).toBe(true);

    // No hay texto visible «Completada»/«Pendiente»: dentro de .lesson-progress solo el svg y el sr-only.
    expect(root.querySelector('.lesson-progress__label')).toBeNull();
    expect(first.querySelector('.lesson-progress__icon')).not.toBeNull();
    expect(second.querySelector('.lesson-progress__icon')).not.toBeNull();
    expect(first.children.length).toBe(2);
    expect(first.children[0].classList.contains('lesson-progress__icon')).toBe(true);
    expect(first.children[1].classList.contains('sr-only')).toBe(true);
    expect(second.children[1].classList.contains('sr-only')).toBe(true);

    expect(first.classList.contains('lesson-progress--done')).toBe(true);
    expect(first.querySelector('svg path[d="M3 8.5 6.3 12 13 4.5"]')).not.toBeNull();
    expect(first.querySelector('svg circle')).toBeNull();
    expect(first.querySelector<HTMLElement>('.sr-only')?.textContent).toBe('Completada');

    expect(second.classList.contains('lesson-progress--done')).toBe(false);
    expect(second.querySelector('svg circle')).not.toBeNull();
    expect(second.querySelector('svg path[d="M3 8.5 6.3 12 13 4.5"]')).toBeNull();
    expect(second.querySelector<HTMLElement>('.sr-only')?.textContent).toBe('Pendiente');
  });

  it('con completedIds a null no muestra estado ni deja hueco: el título encabeza la fila', async () => {
    const { root } = await setup('video', null);
    const link = root.querySelector<HTMLAnchorElement>('li a')!;
    expect(link.querySelector('.lesson-progress')).toBeNull();
    expect(link.querySelector('.lesson-progress__icon')).toBeNull();
    expect(link.querySelector('.lesson-progress__label')).toBeNull();
    expect(link.querySelector('.sr-only')).toBeNull();
    expect(link.firstElementChild?.classList.contains('lesson-title')).toBe(true);
    expect(link.textContent).not.toContain('Completada');
    expect(link.textContent).not.toContain('Pendiente');
  });

  it('refleja marcar y desmarcar sin recrear el índice', async () => {
    const { fixture, root } = await setup('video', new Set());
    const navNode = root.querySelector('nav')!;
    const state = () => root.querySelector<HTMLElement>('li a .lesson-progress')!;
    expect(state().querySelector<HTMLElement>('.sr-only')?.textContent).toBe('Pendiente');

    fixture.componentRef.setInput('completedIds', new Set(['l']));
    fixture.detectChanges();
    expect(state().classList.contains('lesson-progress--done')).toBe(true);
    expect(state().querySelector<HTMLElement>('.sr-only')?.textContent).toBe('Completada');

    fixture.componentRef.setInput('completedIds', new Set());
    fixture.detectChanges();
    expect(state().classList.contains('lesson-progress--done')).toBe(false);
    expect(state().querySelector<HTMLElement>('.sr-only')?.textContent).toBe('Pendiente');
    expect(root.querySelector('nav')).toBe(navNode);
  });

  it('conserva foco, cajón, bloques plegados e indicadores al cambiar de lección', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    const lessons = [
      { id: 'l1', section_id: 's', title: 'Primera', slug: 'uno', content_type: 'video' as const },
      { id: 'l2', section_id: 's', title: 'Segunda', slug: 'dos', content_type: 'video' as const },
    ];
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', lessons);
    fixture.componentRef.setInput('activeId', 'l1');
    fixture.componentRef.setInput('completedIds', new Set(['l1', 'l2']));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const menu = root.querySelector<HTMLButtonElement>('.menu')!;
    const navNode = root.querySelector('nav')!;
    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    menu.click(); fixture.detectChanges();
    expect(navNode.classList.contains('open')).toBe(true);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const second = [...root.querySelectorAll<HTMLAnchorElement>('li a')]
      .find(a => a.textContent?.includes('Segunda'))!;
    second.click(); fixture.detectChanges();
    fixture.componentRef.setInput('activeId', 'l2');
    fixture.componentRef.setInput('completedIds', new Set(['l1']));
    fixture.detectChanges();

    expect(root.querySelector('nav')).toBe(navNode);
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
    expect(root.querySelector<HTMLButtonElement>('.block-toggle')?.getAttribute('aria-expanded')).toBe('false');
    const states = [...root.querySelectorAll<HTMLElement>('li a')]
      .map(a => a.querySelector<HTMLElement>('.lesson-progress .sr-only')?.textContent);
    expect(states).toEqual(['Completada', 'Pendiente']);
  });

  it('el raíl compacto reduce paddings, oculta al docente y conserva títulos, progreso, plegado y Muestra', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    const lessons = [
      { id: 'l1', section_id: 's', title: 'Primera', slug: 'uno', content_type: 'video' as const, is_free_preview: true },
      { id: 'l2', section_id: 's', title: 'Segunda', slug: 'dos', content_type: 'video' as const },
    ];
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('teacher', 'Docente');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', lessons);
    fixture.componentRef.setInput('activeId', 'l1');
    fixture.componentRef.setInput('completedIds', new Set(['l1']));
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const navNode = root.querySelector<HTMLElement>('nav')!;
    const css = componentCss();

    expect(navNode.classList.contains('classroom-nav--compact')).toBe(true);
    expect(css).toMatch(/nav\.classroom-nav--compact\[[^{]*\{[^}]*padding:\s*0\s+0?\.5rem\s+0?\.5rem/);
    expect(css).toMatch(/\.classroom-nav--compact\[[^{]*\.nav-teacher\[[^{]*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.classroom-nav--compact\[[^{]*\.lesson-title\[[^{]*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.classroom-nav--compact\[[^{]*\.block-toggle__title\[[^{]*\{[^}]*text-overflow:\s*ellipsis/);

    const links = [...root.querySelectorAll<HTMLAnchorElement>('li a')];
    expect(links).toHaveLength(2);
    expect(links[0].querySelector<HTMLElement>('.lesson-title')?.getAttribute('title')).toBe('Primera');
    expect(root.querySelector<HTMLElement>('.block-toggle__title')?.getAttribute('title')).toBe('Bloque');
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[0].querySelector('.lesson-progress--done .lesson-progress__icon')).not.toBeNull();
    expect(links[0].querySelector<HTMLElement>('.lesson-progress .sr-only')?.textContent).toBe('Completada');
    expect(links[1].querySelector<HTMLElement>('.lesson-progress .sr-only')?.textContent).toBe('Pendiente');
    expect([...links[0].querySelectorAll<HTMLElement>('.lesson-progress > *:not(.sr-only)')]
      .map(el => el.textContent ?? '').join('')).toBe('');
    expect(links[0].querySelector('small')?.textContent).toBe('Muestra');

    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector<HTMLElement>('#bloque-s')!.hidden).toBe(true);

    // El cajón móvil sigue intacto aunque el índice esté en modo raíl.
    const menu = root.querySelector<HTMLButtonElement>('.menu')!;
    menu.click(); fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(navNode.classList.contains('open')).toBe(true);
  });

  it('el control de compresión vive en la cabecera del nav, es único y emite una sola vez sin abrir el cajón', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', [{ id: 'l', section_id: 's', title: 'Lección', slug: 'leccion', content_type: 'pdf' as const }]);
    fixture.componentRef.setInput('activeId', 'l');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const navNode = root.querySelector<HTMLElement>('nav')!;
    const button = root.querySelector<HTMLButtonElement>('.index-compress')!;
    const menu = root.querySelector<HTMLButtonElement>('.menu')!;
    const css = componentCss();
    const emitted = vi.fn();
    fixture.componentInstance.compressToggle.subscribe(emitted);

    expect(root.querySelectorAll('.index-compress')).toHaveLength(1);
    expect(button.closest('nav')).toBe(navNode);
    expect(button.parentElement?.classList.contains('nav-head')).toBe(true);
    expect(button).not.toBe(menu);
    expect(root.querySelectorAll('.menu')).toHaveLength(1);
    expect(button.textContent?.trim()).toBe('');
    expect(button.querySelector<SVGElement>('svg.index-compress__icon path')?.getAttribute('d'))
      .toBe('M3 5.5h14M3 10h14M3 14.5h14');
    expect(button.getAttribute('aria-label')).toBe('Comprimir índice');
    expect(button.getAttribute('title')).toBe('Comprimir índice');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    // Oculto por defecto (móvil) y visible solo en el media query de escritorio.
    expect(css).toMatch(/\.index-compress\[[^{]*\{[^}]*display:\s*none/);
    expect(css).toMatch(/@media[^{]*min-width:\s*48rem[^{]*\{[^@]*?\.index-compress\[[^{]*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.index-compress\[[^{]*\{[^}]*width:\s*44px/);

    button.focus();
    expect(document.activeElement).toBe(button);
    button.click(); fixture.detectChanges();
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
    expect(menu.getAttribute('aria-expanded')).toBe('false'); // no abre el cajón móvil

    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(button.getAttribute('aria-label')).toBe('Expandir índice');
    expect(button.getAttribute('title')).toBe('Expandir índice');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('ocupa toda la altura como índice integrado y el cajón es de 85% sin sombra', async () => {
    const { root } = await setup();
    const css = componentCss();

    expect(root.querySelector('nav')).not.toBeNull();
    expect(css).toMatch(/\bnav\[[^{]*\{[^}]*height:\s*100%/);
    expect(css).toMatch(/\bnav\[[^{]*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\bnav\[[^{]*\{[^}]*border-radius:\s*0/);
    expect(css).toMatch(/width:\s*85%/);
    expect(css).toMatch(/height:\s*100dvh/);
    expect(css).toMatch(/box-shadow:\s*none/);
    expect(css).toMatch(/\.menu__icon\[[^{]*\{[^}]*stroke-width:\s*1\.6/);
    expect(root.querySelector('.nav-close')).toBeNull();
    expect(root.querySelector('.nav-backdrop')).toBeNull();
  });

  it('el burger móvil crece a 48px táctiles con icono mayor y sin caja', async () => {
    await setup();
    const css = componentCss().replace(/\[_ngcontent-[^\]]*\]/g, '');
    const menuRules = [...css.matchAll(/\.menu\s*\{([^}]*)\}/g)].map(m => m[1].replace(/\s+/g, ' '));
    const mobileMenu = menuRules.find(rule => /display:\s*flex/.test(rule)) ?? '';
    expect(mobileMenu).toMatch(/display:\s*flex/);
    expect(mobileMenu).toMatch(/min-width:\s*48px/);
    expect(mobileMenu).toMatch(/min-height:\s*48px/);
    expect(mobileMenu).toMatch(/padding:\s*0\s+var\(--space-2\)/);
    expect(mobileMenu).toMatch(/border:\s*0\s*;/);
    expect(mobileMenu).toMatch(/background:\s*transparent/);
    const iconRule = css.match(/\.menu__icon\s*\{([^}]*)\}/)?.[1]?.replace(/\s+/g, ' ') ?? '';
    expect(iconRule).toMatch(/width:\s*1\.45rem/);
    expect(iconRule).toMatch(/height:\s*1\.45rem/);
    expect(iconRule).toMatch(/stroke-width:\s*1\.6/);
    // Escritorio sigue sin burger; el cajón y el cierre flotante conservan su posición.
    expect(css).toMatch(/\.menu\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/nav\.open\s*\{[^}]*position:\s*fixed/);
  });

  it('el burger abierto conserva la posición del cerrado: solo cambia el plano', async () => {
    await setup();
    const css = componentCss().replace(/\[_ngcontent-[^\]]*\]/g, '');
    const mobileMenu = [...css.matchAll(/\.menu\s*\{([^}]*)\}/g)]
      .map(m => m[1].replace(/\s+/g, ' ')).find(rule => /display:\s*flex/.test(rule)) ?? '';
    expect(mobileMenu).toMatch(/position:\s*fixed/);
    expect(mobileMenu).toMatch(/inset:\s*var\(--space-4\)\s+auto\s+auto\s+0/);
    const openRule = css.match(/\.menu--open\s*\{([^}]*)\}/)?.[1]?.replace(/\s+/g, ' ') ?? '';
    expect(openRule).toMatch(/z-index:\s*50/);
    expect(openRule).not.toMatch(/position\s*:/);
    expect(openRule).not.toMatch(/inset\s*:/);
  });

  it('usa tokens de tema en la geometría del índice sin alterar el cajón', async () => {
    await setup();
    const css = componentCss();

    for (const token of ['--space-', '--border-width']) {
      expect(css).toContain(`var(${token}`);
    }
    expect(css).toMatch(/width:\s*85%/);
    expect(css).toMatch(/height:\s*100dvh/);
    expect(css).toMatch(/box-shadow:\s*none/);
  });

  it('sin favoriteIds no muestra ninguna estrella en el índice', async () => {
    const { root } = await setup('video');
    expect(root.querySelector('.lesson-favorite')).toBeNull();
    expect(root.textContent).not.toContain('Favorita');
  });

  it('marca solo las filas favoritas con una estrella decorativa al final del enlace', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    const lessons = [
      { id: 'l1', section_id: 's', title: 'Primera', slug: 'uno', content_type: 'video' as const },
      { id: 'l2', section_id: 's', title: 'Segunda', slug: 'dos', content_type: 'pdf' as const, is_free_preview: true },
    ];
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', lessons);
    fixture.componentRef.setInput('activeId', 'l1');
    fixture.componentRef.setInput('completedIds', new Set());
    fixture.componentRef.setInput('favoriteIds', new Set(['l2']));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('li a')];
    expect(links).toHaveLength(2);
    expect(links[0].querySelector('.lesson-favorite')).toBeNull();

    const star = links[1].querySelector<HTMLElement>('.lesson-favorite')!;
    expect(star).not.toBeNull();
    expect(star.closest('a')).toBe(links[1]);
    expect(star.parentElement).toBe(links[1]);
    // Después del título y de «Muestra», al final de la fila, sin solapar el progreso.
    expect(links[1].querySelector('small')?.textContent).toBe('Muestra');
    expect(links[1].querySelector('small')?.nextElementSibling).toBe(star);
    expect(star.nextElementSibling).toBeNull();
    expect(links[1].firstElementChild?.classList.contains('lesson-progress')).toBe(true);
    expect(star.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(star.querySelector('svg path')?.getAttribute('d')).toContain('M10 2.6');
    expect(star.querySelector<HTMLElement>('.sr-only')?.textContent).toBe('Favorita');
    expect(star.querySelector('button')).toBeNull();
    expect([...root.querySelectorAll('button')].some(b => b.textContent?.includes('Favorita'))).toBe(false);

    const css = componentCss();
    expect(css).toMatch(/\.lesson-favorite[^{]*\{[^}]*margin-inline-start:\s*auto/);
    expect(css).toMatch(/\.lesson-favorite[^{]*\{[^}]*color:\s*var\(--accent\)/);
    expect(css).toMatch(/\.lesson-favorite__icon[^{]*\{[^}]*fill:\s*currentColor/);
    expect(css).toMatch(/\.lesson-favorite__icon[^{]*\{[^}]*stroke:\s*currentColor/);
  });

  it('refleja cambiar el set de favoritos sin recrear el índice ni perder el progreso', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', [{ id: 'l', section_id: 's', title: 'Lección', slug: 'leccion', content_type: 'video' as const }]);
    fixture.componentRef.setInput('activeId', 'l');
    fixture.componentRef.setInput('completedIds', new Set(['l']));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const navNode = root.querySelector('nav')!;
    expect(root.querySelector('.lesson-favorite')).toBeNull();

    fixture.componentRef.setInput('favoriteIds', new Set(['l']));
    fixture.detectChanges();
    expect(root.querySelector('.lesson-favorite .sr-only')?.textContent).toBe('Favorita');
    expect(root.querySelector('.lesson-progress--done')).not.toBeNull();
    expect(root.querySelector('nav')).toBe(navNode);

    fixture.componentRef.setInput('favoriteIds', new Set());
    fixture.detectChanges();
    expect(root.querySelector('.lesson-favorite')).toBeNull();
    expect(root.querySelector('nav')).toBe(navNode);
  });

  it('en vista previa de administración el índice sigue intacto con el set vacío', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('admin', true);
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', [{ id: 'l', section_id: 's', title: 'Lección', slug: 'leccion', content_type: 'video' as const }]);
    fixture.componentRef.setInput('activeId', 'l');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const link = root.querySelector<HTMLAnchorElement>('li a')!;
    expect(root.querySelector('.lesson-favorite')).toBeNull();
    expect(link.getAttribute('href')).toBe('/admin/vista-previa/curso/l');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.querySelector('.lesson-title')?.textContent).toBe('Lección');
  });
});
