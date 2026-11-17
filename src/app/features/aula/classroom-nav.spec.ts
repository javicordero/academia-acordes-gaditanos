import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClassroomNav } from './classroom-nav';

describe('Índice del aula', () => {
  it('identifica la lección activa y despliega el índice móvil', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', [{ id: 'l', section_id: 's', title: 'Lección', slug: 'leccion' }]);
    fixture.componentRef.setInput('activeId', 'l');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a[aria-current="page"]')?.textContent).toContain('Lección');
    expect(root.querySelector('details')?.open).toBe(true);
    const button = root.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('Escape en el botón de apertura cierra el índice sin robar el foco y no opera si ya está cerrado', async () => {
    await TestBed.configureTestingModule({ imports: [ClassroomNav], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(ClassroomNav);
    fixture.componentRef.setInput('title', 'Curso');
    fixture.componentRef.setInput('courseId', 'curso');
    fixture.componentRef.setInput('courseSlug', 'curso');
    fixture.componentRef.setInput('sections', [{ id: 's', title: 'Bloque' }]);
    fixture.componentRef.setInput('lessons', [{ id: 'l', section_id: 's', title: 'Lección', slug: 'leccion' }]);
    fixture.componentRef.setInput('activeId', 'l');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('button')!;
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
});
