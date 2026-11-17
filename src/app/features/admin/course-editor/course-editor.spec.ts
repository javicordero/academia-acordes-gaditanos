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
});
