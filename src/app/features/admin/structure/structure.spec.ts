import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Structure } from './structure';
import { StructureRepository } from '../structure-repository';

describe('Structure', () => {
  const repo = { list: vi.fn(), saveSection: vi.fn(), saveLesson: vi.fn() };
  const course = { id: 'course', title: 'Curso', slug: 'curso', summary: null, description: null,
    level: 'basico' as const, status: 'draft' as const, sort_order: 0, published_at: null };
  const section = { id: 'section', course_id: 'course', title: 'Bloque', summary: null, position: 2 };
  beforeEach(() => {
    vi.resetAllMocks();
    repo.list.mockResolvedValue({ sections: [section], lessons: [] });
    repo.saveSection.mockResolvedValue(undefined);
    repo.saveLesson.mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: StructureRepository, useValue: repo }] });
  });
  async function setup() {
    const fixture = TestBed.createComponent(Structure);
    fixture.componentRef.setInput('course', course);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('carga y muestra bloques y estado vacío', async () => {
    repo.list.mockResolvedValueOnce({ sections: [], lessons: [] });
    const fixture = await setup();
    expect(fixture.nativeElement.textContent).toContain('No hay bloques');
    expect(fixture.nativeElement.textContent).toContain('Añade una lección');
    expect(repo.list).toHaveBeenCalledWith('course');
  });
  it('al abrir materiales enfoca el panel y al cerrar vuelve a estructura sin perder el editor', async () => {
    const lesson = { id: '22222222-2222-2222-2222-222222222222', course_id: 'course', section_id: 'section',
      slug: 'leccion', title: 'Lección', summary: null, content_md: null, position: 0,
      duration_seconds: null, is_free_preview: false, is_published: false };
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Vista previa del aula');
    expect(fixture.nativeElement.querySelector('a[aria-label="Ver en el aula Lección"]').getAttribute('href'))
      .toBe('/admin/vista-previa/course/22222222-2222-2222-2222-222222222222');
    component.editLesson(section, lesson); component.lessonTitle = 'Sin guardar';
    component.openMaterials(lesson); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('materials-heading');
    expect(component.lessonTitle).toBe('Sin guardar');
    component.closeMaterials(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain('Estructura:');
    expect(component.lessonTitle).toBe('Sin guardar');
  });
  it('oculta edición si falla la carga', async () => {
    repo.list.mockRejectedValueOnce(new Error('denied'));
    const fixture = await setup();
    expect(fixture.nativeElement.textContent).toContain('No se ha podido cargar');
    expect(fixture.nativeElement.textContent).not.toContain('Añadir bloque');
  });
  it('valida y normaliza antes de guardar al final sin mover lecciones', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(section);
    component.lessonTitle = '  Título  '; component.slug = ' mala ruta ';
    await component.saveLesson();
    expect(repo.saveLesson).not.toHaveBeenCalled();
    component.slug = ' leccion '; component.duration = '45'; component.content = ' texto ';
    await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenCalledWith('course', 'section', expect.objectContaining({
      title: 'Título', slug: 'leccion', duration_seconds: 45, content_md: 'texto', is_published: false,
    }), 0, undefined);
  });
  it('guarda bloques al final e informa de error sin especular', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editSection(); component.sectionTitle = ' Nuevo ';
    repo.saveSection.mockRejectedValueOnce(new Error('conflict'));
    await component.saveSection();
    expect(repo.saveSection).toHaveBeenCalledWith('course', { title: 'Nuevo', summary: null }, 3, undefined);
    expect(component.error()).toContain('permisos');
    expect(component.error()).not.toContain('conflicto');
  });
  it('ignora respuestas antiguas, incluso errores y finalizaciones', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    let rejectOld!: (reason: Error) => void;
    let resolveNew!: (value: { sections: typeof section[]; lessons: [] }) => void;
    repo.list.mockReturnValueOnce(new Promise((_, reject) => rejectOld = reject))
      .mockReturnValueOnce(new Promise(resolve => resolveNew = resolve));
    const old = component.load(); const recent = component.load();
    rejectOld(new Error('old')); await old;
    expect(component.loading()).toBe(true); expect(component.error()).toBe('');
    resolveNew({ sections: [], lessons: [] }); await recent;
    expect(component.sections()).toEqual([]); expect(component.loading()).toBe(false);
  });
  it('ignora la respuesta después de destruir', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    let resolve!: (value: { sections: typeof section[]; lessons: [] }) => void;
    repo.list.mockReturnValueOnce(new Promise(r => resolve = r));
    const pending = component.load(); fixture.destroy();
    resolve({ sections: [], lessons: [] }); await pending;
    expect(component.sections()).toEqual([section]);
  });
  it('conserva el error de recarga tras guardar sin volver a guardar', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editSection(); component.sectionTitle = 'Bloque';
    repo.list.mockRejectedValueOnce(new Error('unavailable'));
    await component.saveSection();
    expect(repo.saveSection).toHaveBeenCalledTimes(1);
    expect(component.loadFailed()).toBe(true);
    expect(component.error()).toContain('cargar');
  });
  it('valida título y duración individualmente y conserva las marcas', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(section); component.lessonTitle = 'x'.repeat(161);
    component.slug = 'leccion'; component.duration = '-1';
    await component.saveLesson(); fixture.detectChanges();
    expect(component.invalid().lessonTitle).toBe(true);
    expect(component.invalid().duration).toBe(true);
    expect(fixture.nativeElement.querySelector('#lesson-duration').getAttribute('aria-describedby')).toBe('lesson-duration-error');
    expect(repo.saveLesson).not.toHaveBeenCalled();
    component.lessonTitle = 'Válido'; component.duration = ''; component.preview = true; component.published = true;
    await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenCalledWith('course', 'section',
      expect.objectContaining({ is_free_preview: true, is_published: true }), 0, undefined);
  });
  it('enfoca ambos editores y devuelve foco al encabezado al cancelar o guardar', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editSection(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('section-title');
    component.cancelEditor(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain('Estructura:');
    component.editLesson(section); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('lesson-title');
    component.lessonTitle = 'Título'; component.slug = 'titulo';
    await component.saveLesson(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain('Estructura:');
  });
});
