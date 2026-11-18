import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ClassroomNav } from './classroom-nav';

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
    expect(root.querySelector('a[aria-current="page"]')?.textContent).toContain('PDF');
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
    expect(root.querySelector('.nav-backdrop')).not.toBeNull();
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

  it('el cajón ofrece un cierre con nombre accesible que devuelve el foco al hamburger', async () => {
    const { fixture, root } = await setup();
    const menu = root.querySelector<HTMLButtonElement>('.menu')!;
    const closeButton = root.querySelector<HTMLButtonElement>('.nav-close')!;
    expect(closeButton.getAttribute('aria-label')).toBe('Cerrar índice de lecciones');
    expect(closeButton.getAttribute('title')).toBe('Cerrar índice de lecciones');
    expect(closeButton.querySelector('svg')).not.toBeNull();

    menu.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    closeButton.focus();
    closeButton.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
    expect(document.body.style.overflow).toBe('');
  });

  it('el índice sitúa iconos propios de bloque y tipo, con chevron y etiqueta oculta', async () => {
    const { fixture, root } = await setup('video');
    const toggle = root.querySelector<HTMLButtonElement>('.block-toggle')!;
    const chevron = toggle.querySelector<HTMLElement>('.block-toggle__chevron')!;
    expect(toggle.querySelector('.block-toggle__folder')).not.toBeNull();
    expect(chevron.textContent).toBe('▾');
    expect(root.querySelector('.lesson-icon svg')).not.toBeNull();
    expect(root.querySelector('.sr-only')?.textContent).toBe('Vídeo:');

    toggle.click();
    fixture.detectChanges();
    expect(chevron.textContent).toBe('▸');
  });

  it('el icono de recurso de vídeo usa un rectángulo de pantalla', async () => {
    const { root } = await setup('video');
    expect(root.querySelector('.lesson-icon svg rect')).not.toBeNull();
  });

  it('el icono de recurso PDF usa un documento y mantiene su etiqueta oculta', async () => {
    const { root } = await setup('pdf');
    expect(root.querySelector('.lesson-icon svg path[d^="M4 2h5"]')).not.toBeNull();
    expect(root.textContent).toContain('PDF:');
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

  it('distingue cada lección completada de la pendiente con icono y nombre accesible', async () => {
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
    expect(first.classList.contains('lesson-progress--done')).toBe(true);
    expect(first.querySelector('svg path[d="M3 8.5 6.3 12 13 4.5"]')).not.toBeNull();
    expect(first.querySelector('svg circle')).toBeNull();
    expect(first.querySelector('.sr-only')?.textContent).toBe('Completada');
    expect(links[0].textContent).toContain('Completada');

    expect(second.classList.contains('lesson-progress--done')).toBe(false);
    expect(second.querySelector('svg circle')).not.toBeNull();
    expect(second.querySelector('svg path[d="M3 8.5 6.3 12 13 4.5"]')).toBeNull();
    expect(second.querySelector('.sr-only')?.textContent).toBe('Pendiente');
    expect(links[1].textContent).toContain('Pendiente');
  });

  it('refleja marcar y desmarcar sin recrear el índice', async () => {
    const { fixture, root } = await setup('video', new Set());
    const navNode = root.querySelector('nav')!;
    const state = () => root.querySelector<HTMLElement>('li a .lesson-progress')!;
    expect(state().querySelector('.sr-only')?.textContent).toBe('Pendiente');

    fixture.componentRef.setInput('completedIds', new Set(['l']));
    fixture.detectChanges();
    expect(state().classList.contains('lesson-progress--done')).toBe(true);
    expect(state().querySelector('.sr-only')?.textContent).toBe('Completada');

    fixture.componentRef.setInput('completedIds', new Set());
    fixture.detectChanges();
    expect(state().classList.contains('lesson-progress--done')).toBe(false);
    expect(state().querySelector('.sr-only')?.textContent).toBe('Pendiente');
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
});
