import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ClassroomNav } from './classroom-nav';

describe('Índice del aula', () => {
  async function setup(contentType: 'pdf' | 'video' = 'pdf') {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('teacher', 'Docente');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', [{ id: 'l', section_id: 's', title: 'Lección', slug: 'leccion', content_type: contentType }]);
    fixture.componentRef.setInput('activeId', 'l');
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
});
