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
  const makeLesson = (id: string, title: string) => ({ id, course_id: 'course', section_id: 'section',
    slug: title.toLowerCase(), title, summary: null, content_md: null, position: 0,
    duration_seconds: null, is_free_preview: false, is_published: false, content_type: 'video' as const });
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
      duration_seconds: null, is_free_preview: false, is_published: false, content_type: 'video' as const };
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
  it('ofrece el vídeo de la lección guardada junto a los materiales', async () => {
    const saved = makeLesson('22222222-2222-2222-2222-222222222222', 'Lección');
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [saved] });
    const fixture = await setup();
    const video = fixture.nativeElement.querySelector('a[aria-label="Vídeo de la lección Lección"]');
    expect(video).not.toBeNull();
    expect(video.getAttribute('href')).toBe('/admin/course/22222222-2222-2222-2222-222222222222/video');
    expect(fixture.nativeElement.querySelector('button[aria-label="Materiales PDF de Lección"]')).not.toBeNull();
  });
  it('no ofrece el vídeo en lecciones nuevas sin guardar', async () => {
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [makeLesson('l', 'Sin guardar')] });
    const fixture = await setup();
    expect(fixture.nativeElement.querySelector('a[aria-label^="Vídeo de la lección"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label^="Materiales PDF de"]')).toBeNull();
    fixture.componentInstance.editLesson(section); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[aria-label^="Vídeo de la lección"]')).toBeNull();
  });
  it('muestra un enlace de vídeo por lección guardada sin duplicarlos', async () => {
    const first = makeLesson('11111111-1111-1111-1111-111111111111', 'Primera');
    const second = makeLesson('22222222-2222-2222-2222-222222222222', 'Segunda');
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [first, second] });
    const fixture = await setup();
    const links = [...fixture.nativeElement.querySelectorAll('a[aria-label^="Vídeo de la lección "]')];
    expect(links).toHaveLength(2);
    expect(links.map((link: HTMLAnchorElement) => link.getAttribute('href'))).toEqual([
      '/admin/course/11111111-1111-1111-1111-111111111111/video',
      '/admin/course/22222222-2222-2222-2222-222222222222/video',
    ]);
    expect(fixture.nativeElement.querySelectorAll('button[aria-label^="Materiales PDF de"]')).toHaveLength(2);
  });
  it('oculta edición si falla la carga', async () => {
    repo.list.mockRejectedValueOnce(new Error('denied'));
    const fixture = await setup();
    expect(fixture.nativeElement.textContent).toContain('No se ha podido cargar');
    expect(fixture.nativeElement.textContent).not.toContain('Añadir bloque');
  });
  it('genera identificadores normalizados y únicos en todo el curso', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.lessons.set([
      { id: 'l', course_id: 'course', section_id: 'otro', slug: 'titulo-ano', title: 'Otro',
        summary: null, content_md: null, duration_seconds: null, position: 0, is_free_preview: false, is_published: false, content_type: 'text' },
    ]);
    component.editLesson(section);
    component.lessonTitle = '  Título -- Año  ';
    await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenCalledWith('course', 'section', {
      title: 'Título -- Año', content_type: 'video', is_free_preview: false, is_published: false,
    }, 0, undefined, 'titulo-ano-2');
    component.editLesson(section); component.lessonTitle = '🎸';
    await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenLastCalledWith('course', 'section', expect.anything(), 0, undefined, 'leccion');
  });
  it('oculta campos técnicos y conserva los datos anteriores al editar', async () => {
    const lesson = { id: 'l', course_id: 'course', section_id: 'section', slug: 'ruta-antigua',
      title: 'Anterior', summary: ' resumen ', content_md: ' texto ', duration_seconds: 42, position: 0,
      is_free_preview: false, is_published: false, content_type: 'text' as const };
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(section, lesson); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#lesson-slug, #lesson-summary, #lesson-content, #lesson-duration')).toBeNull();
    expect(fixture.nativeElement.querySelector('#lesson-type')).not.toBeNull();
    component.lessonTitle = 'Nuevo'; await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenCalledWith('course', 'section',
      { title: 'Nuevo', content_type: 'text', is_free_preview: false, is_published: false }, 1, lesson, undefined);
  });
  it('informa de conflictos sin reintentar ni atribuirles una causa concreta', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(section); component.lessonTitle = 'Lección';
    repo.saveLesson.mockRejectedValueOnce(new Error('save_conflict'));
    await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenCalledTimes(1);
    expect(component.error()).toContain('conflicto');
  });
  it('guarda PDF y texto y rechaza tipos desconocidos', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(section); component.lessonTitle = 'Lección';
    expect(component.contentType).toBe('video');
    component.contentType = 'audio'; await component.saveLesson();
    expect(repo.saveLesson).not.toHaveBeenCalled();
    expect(component.invalid().contentType).toBe(true);
    component.contentType = 'pdf'; await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenLastCalledWith('course', 'section', expect.objectContaining({content_type: 'pdf'}), 0, undefined, 'leccion');
    component.editLesson(section); component.lessonTitle = 'Texto'; component.contentType = 'text';
    await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenLastCalledWith('course', 'section', expect.objectContaining({content_type: 'text'}), 0, undefined, 'texto');
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
  it('valida el título y conserva las marcas', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(section); component.lessonTitle = 'x'.repeat(161);
    await component.saveLesson(); fixture.detectChanges();
    expect(component.invalid().lessonTitle).toBe(true);
    expect(fixture.nativeElement.querySelector('#lesson-title').getAttribute('aria-describedby')).toBe('lesson-title-error');
    expect(repo.saveLesson).not.toHaveBeenCalled();
    component.lessonTitle = 'Válido'; component.preview = true; component.published = true;
    await component.saveLesson();
    expect(repo.saveLesson).toHaveBeenCalledWith('course', 'section',
      expect.objectContaining({ is_free_preview: true, is_published: true }), 0, undefined, 'valido');
  });
  it('enfoca ambos editores y devuelve foco al encabezado al cancelar o guardar', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editSection(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('section-title');
    component.cancelEditor(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain('Estructura:');
    component.editLesson(section); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('lesson-title');
    component.lessonTitle = 'Título';
    await component.saveLesson(); fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain('Estructura:');
  });
});
