import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CourseEditor } from './course-editor';
import { CoursesRepository } from '../courses-repository';

describe('Editor de cursos', () => {
  const save = vi.fn();
  beforeEach(() => {
    save.mockReset();
    TestBed.configureTestingModule({ imports: [CourseEditor], providers: [
      { provide: CoursesRepository, useValue: { save } },
    ] });
  });

  it('valida slug, nivel, estado y orden sin llamar al repositorio', async () => {
    const fixture = TestBed.createComponent(CourseEditor);
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    const model = { title: 'Curso', slug: 'curso', summary: '', description: '', level: 'basico', status: 'draft', sort_order: '0' };
    for (const change of [
      { slug: 'MAL slug' }, { level: 'otro' }, { status: 'otro' },
      { sort_order: '1.5' }, { sort_order: '2147483648' }, { title: '   ' },
    ]) {
      editor.model.set({ ...model, ...change });
      await editor.save();
    }
    expect(save).not.toHaveBeenCalled();
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('#course-title') as HTMLElement;
    expect(title.getAttribute('aria-describedby')).toBe('title-error');
    expect(fixture.nativeElement.querySelector('#title-error')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('legend')?.textContent).toContain('Datos del curso');
  });

  it('normaliza textos opcionales, evita envíos dobles y emite éxito', async () => {
    let resolve!: (value: unknown) => void;
    save.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const fixture = TestBed.createComponent(CourseEditor);
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('#course-title').hasAttribute('aria-describedby')).toBe(false);
    editor.model.set({ title: '  Curso  ', slug: 'curso', summary: '  ', description: '  texto  ', level: 'basico', status: 'draft', sort_order: '-2' });
    const saved = vi.fn();
    editor.saved.subscribe(saved);
    const first = editor.save();
    await editor.save();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Curso', summary: null, description: 'texto', sort_order: -2,
    }), undefined);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    resolve({});
    await first;
    expect(saved).toHaveBeenCalledOnce();
  });

  it('resume los campos inválidos y usa texto neutro sobre el acceso', async () => {
    const fixture = TestBed.createComponent(CourseEditor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('políticas de acceso');
    expect(el.querySelector('.editor-note')?.textContent).toContain('datos editoriales');
    expect(el.querySelector('#slug-hint')?.textContent).toContain('Minúsculas');
    expect(el.querySelector('#order-hint')?.textContent).toContain('entero');

    const editor = fixture.componentInstance;
    editor.model.set({
      title: '   ', slug: 'MAL slug', summary: '', description: '',
      level: 'basico', status: 'draft', sort_order: '1.5',
    });
    await editor.save();
    fixture.detectChanges();
    const summary = el.querySelector<HTMLElement>('.form-error-summary')!;
    expect(summary.getAttribute('role')).toBe('alert');
    expect(summary.textContent).toContain('Título');
    expect(summary.textContent).toContain('Identificador (slug)');
    expect(summary.textContent).toContain('Orden');
    expect(summary.querySelector('a[href="#course-title"]')).not.toBeNull();
    expect(el.querySelectorAll('button[type="submit"]').length).toBe(1);
    expect(el.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Guardar');
  });

  it('alinea etiqueta, ayuda y error y lleva el foco al encabezado', async () => {
    const fixture = TestBed.createComponent(CourseEditor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table')).toBeNull();
    expect(el.querySelector('.form-field .field-hint')).not.toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe('Crear curso');

    const editor = fixture.componentInstance;
    editor.model.set({
      title: 'Curso', slug: 'MAL slug', summary: '', description: '',
      level: 'basico', status: 'draft', sort_order: '0',
    });
    await editor.save();
    fixture.detectChanges();
    expect(el.querySelector('#course-slug')?.getAttribute('aria-describedby')).toBe('slug-hint slug-error');
    expect(el.querySelector('#slug-error')).not.toBeNull();
  });

  it('los controles con aria-label incluyen su texto visible', () => {
    const fixture = TestBed.createComponent(CourseEditor);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const labelled = el.querySelectorAll<HTMLElement>(
      'button[aria-label], a[aria-label], input[aria-label], select[aria-label]',
    );
    for (const control of labelled) {
      const visible = (control.textContent ?? '').trim();
      if (visible) {
        expect((control.getAttribute('aria-label') ?? '').toLowerCase()).toContain(visible.toLowerCase());
      }
    }
  });
});
