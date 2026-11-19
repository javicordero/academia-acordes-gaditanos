import { readFileSync } from 'node:fs';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { vi } from 'vitest';
import { Structure } from './structure';
import { StructureRepository } from '../structure-repository';
import { LessonVideo } from '../lesson-video/lesson-video';
import { LessonMaterials } from '../lesson-materials/lesson-materials';
import { AuthService } from '../../../core/auth/auth.service';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import { LessonResources } from '../../../shared/lesson-resources/lesson-resources';

describe('Structure', () => {
  const repo = {
    list: vi.fn(), saveSection: vi.fn(), saveLesson: vi.fn(),
    reorderCourseSections: vi.fn(), reorderSectionLessons: vi.fn(),
  };
  const course = { id: 'course', title: 'Curso', slug: 'curso', summary: null, description: null,
    level: 'basico' as const, status: 'draft' as const, sort_order: 0, published_at: null };
  const section = { id: 'section', course_id: 'course', title: 'Bloque', summary: null, position: 2 };
  const makeLesson = (id: string, title: string) => ({ id, course_id: 'course', section_id: 'section',
    slug: title.toLowerCase(), title, summary: null, content_md: null, position: 0,
    duration_seconds: null, is_free_preview: false, is_published: false, content_type: 'video' as const });
  const invoke = vi.fn();
  const listMaterials = vi.fn();
  const session = signal<{ user: { id: string } } | null>({ user: { id: 'admin' } });
  beforeEach(() => {
    vi.resetAllMocks();
    repo.list.mockResolvedValue({ sections: [section], lessons: [] });
    repo.saveSection.mockResolvedValue(undefined);
    repo.saveLesson.mockResolvedValue(undefined);
    repo.reorderCourseSections.mockResolvedValue(undefined);
    repo.reorderSectionLessons.mockResolvedValue(undefined);
    session.set({ user: { id: 'admin' } });
    invoke.mockResolvedValue({ data: { state: 'none', hasVideo: false,
      limits: { maxBytes: 1000, allowedMimeTypes: ['video/mp4'] } }, error: null });
    listMaterials.mockResolvedValue([]);
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: StructureRepository, useValue: repo },
      { provide: AuthService, useValue: { session: session.asReadonly() } },
      { provide: SUPABASE_CLIENT, useValue: { functions: { invoke } } },
      { provide: LessonResources, useValue: { list: listMaterials, prepare: vi.fn(), upload: vi.fn(),
        finalize: vi.fn(), download: vi.fn() } },
    ] });
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
  it('muestra un esqueleto accesible mientras carga la estructura', async () => {
    let resolve!: (value: { sections: typeof section[]; lessons: [] }) => void;
    repo.list.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const fixture = TestBed.createComponent(Structure);
    fixture.componentRef.setInput('course', course);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const skeleton = el.querySelector('app-skeleton') as HTMLElement | null;
    expect(skeleton?.querySelector('.skeleton')?.getAttribute('data-variant')).toBe('index');
    expect(skeleton!.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.sr-only[role="status"]')?.textContent?.trim()).toBe('Cargando estructura…');
    expect(el.querySelectorAll('.sr-only[role="status"]')).toHaveLength(1);
    resolve({ sections: [], lessons: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('app-skeleton')).toBeNull();
    expect(el.textContent).toContain('No hay bloques');
  });
  it('al abrir materiales enfoca el panel y al cerrar vuelve a estructura sin perder el editor', async () => {
    const lesson = { id: '22222222-2222-2222-2222-222222222222', course_id: 'course', section_id: 'section',
      slug: 'leccion', title: 'Lección', summary: null, content_md: null, position: 0,
      duration_seconds: null, is_free_preview: false, is_published: false, content_type: 'video' as const };
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Vista previa del aula');
    component.editLesson(section, lesson); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a[aria-label="Ver en el aula Lección"]').getAttribute('href'))
      .toBe('/admin/vista-previa/course/22222222-2222-2222-2222-222222222222');
    component.lessonTitle = 'Sin guardar';
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
    fixture.componentInstance.editLesson(section, saved); fixture.detectChanges(); await fixture.whenStable();
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
  it('muestra en el inspector los accesos de la lección seleccionada sin duplicarlos', async () => {
    const first = makeLesson('11111111-1111-1111-1111-111111111111', 'Primera');
    const second = makeLesson('22222222-2222-2222-2222-222222222222', 'Segunda');
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [first, second] });
    const fixture = await setup(); const component = fixture.componentInstance;
    const linkFor = () => fixture.nativeElement.querySelector('a[aria-label^="Vídeo de la lección "]');
    component.editLesson(section, first); fixture.detectChanges(); await fixture.whenStable();
    expect(linkFor().getAttribute('href')).toBe('/admin/course/11111111-1111-1111-1111-111111111111/video');
    expect(fixture.nativeElement.querySelectorAll('a[aria-label^="Vídeo de la lección "]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('button[aria-label^="Materiales PDF de"]')).toHaveLength(1);
    component.editLesson(section, second); fixture.detectChanges(); await fixture.whenStable();
    expect(linkFor().getAttribute('href')).toBe('/admin/course/22222222-2222-2222-2222-222222222222/video');
    expect(fixture.nativeElement.querySelectorAll('a[aria-label^="Vídeo de la lección "]')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('a[aria-label="Ver en el aula Segunda"]').getAttribute('href'))
      .toBe('/admin/vista-previa/course/22222222-2222-2222-2222-222222222222');
    expect(fixture.nativeElement.querySelector('a[aria-label="Gestionar vídeo y materiales de Segunda"]').getAttribute('href'))
      .toBe('/admin/curso/course/leccion/22222222-2222-2222-2222-222222222222');
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

  const fakeDrag = () => ({ preventDefault: vi.fn(), dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() } }) as unknown as DragEvent;

  const block = (id: string, title: string, position: number) => ({ ...section, id, title, position });
  const row = (id: string, title: string, sectionId: string, position: number) => ({
    id, course_id: 'course', section_id: sectionId, slug: title.toLowerCase(), title,
    summary: null, content_md: null, position, duration_seconds: null,
    is_free_preview: false, is_published: false, content_type: 'video' as const,
  });

  it('ofrece subir y bajar con etiqueta accesible y desactiva los extremos', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    const c = block('sc', 'Gamma', 2);
    repo.list.mockResolvedValueOnce({ sections: [a, b, c], lessons: [] });
    const fixture = await setup();
    const query = (label: string) => fixture.nativeElement.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    expect(query('Subir bloque Alfa, posición 1 de 3').disabled).toBe(true);
    expect(query('Bajar bloque Alfa, posición 1 de 3').disabled).toBe(false);
    expect(query('Bajar bloque Gamma, posición 3 de 3').disabled).toBe(true);
    expect(query('Subir bloque Beta, posición 2 de 3')).not.toBeNull();
  });

  it('reordena bloques con lista completa, mensaje de estado y foco conservado', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    const c = block('sc', 'Gamma', 2);
    repo.list.mockResolvedValueOnce({ sections: [a, b, c], lessons: [] })
      .mockResolvedValueOnce({ sections: [b, a, c], lessons: [] });
    const fixture = await setup();
    await fixture.componentInstance.moveSection(b, -1);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(repo.reorderCourseSections).toHaveBeenCalledWith('course', ['sb', 'sa', 'sc']);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Bloque «Beta» movido a la posición 1 de 3.');
    expect(document.activeElement?.getAttribute('data-reorder-key')).toBe('section:down:sb');
  });

  it('revierte el cambio y avisa por role=alert si la RPC deniega permisos', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] });
    repo.reorderCourseSections.mockRejectedValueOnce(new Error('forbidden'));
    const fixture = await setup();
    await fixture.componentInstance.moveSection(b, -1);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.sections()).toEqual([a, b]);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se ha podido reordenar');
    expect(document.activeElement?.getAttribute('data-reorder-key')).toBe('section:up:sb');
    expect(repo.list).toHaveBeenCalledTimes(1);
  });

  it('permite reintentar tras un error y enfoca el botón movido', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] })
      .mockResolvedValueOnce({ sections: [{ ...b, position: 0 }, { ...a, position: 1 }], lessons: [] });
    repo.reorderCourseSections.mockRejectedValueOnce(new Error('forbidden'));
    const fixture = await setup(); const component = fixture.componentInstance;
    await component.moveSection(b, -1);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se ha podido reordenar');
    await component.moveSection(b, -1);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(repo.reorderCourseSections).toHaveBeenCalledTimes(2);
    expect(repo.reorderCourseSections).toHaveBeenLastCalledWith('course', ['sb', 'sa']);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Beta');
    expect(document.activeElement?.getAttribute('data-reorder-key')).toBe('section:down:sb');
  });

  it('emite aria-grabbed y aria-dropeffect y no resalta la fila de origen', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] });
    const fixture = await setup(); const component = fixture.componentInstance;
    const grabbed = () => [...fixture.nativeElement.querySelectorAll('.structure-drag[aria-grabbed]')]
      .map((item: HTMLElement) => item.getAttribute('aria-grabbed'));
    const effects = () => [...fixture.nativeElement.querySelectorAll('[aria-dropeffect]')]
      .map((item: HTMLElement) => item.getAttribute('aria-dropeffect'));
    expect(grabbed()).toEqual(['false', 'false']);
    expect(effects()).toEqual(['none', 'none']);
    component.dragSectionStart(fakeDrag(), a);
    fixture.detectChanges();
    expect(grabbed()).toEqual(['true', 'false']);
    component.dragSectionOver(fakeDrag(), a);
    fixture.detectChanges();
    expect(component.dropTarget()).toBeNull();
    expect(fixture.nativeElement.querySelector('.structure-section--dragover')).toBeNull();
    component.dragSectionOver(fakeDrag(), b);
    fixture.detectChanges();
    expect(component.dropTarget()).toEqual({ kind: 'section', id: 'sb' });
    expect(fixture.nativeElement.querySelector('.structure-section--dragover')).not.toBeNull();
    expect(effects()).toEqual(['none', 'move']);
    component.dragEnd(); fixture.detectChanges();
    expect(grabbed()).toEqual(['false', 'false']);
  });

  it('ignora un doble clic mientras la reordenación está en curso', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] });
    const fixture = await setup(); const component = fixture.componentInstance;
    const first = component.moveSection(b, -1);
    const second = component.moveSection(b, -1);
    await Promise.all([first, second]);
    expect(repo.reorderCourseSections).toHaveBeenCalledTimes(1);
  });

  it('reordena solo las lecciones del bloque y respeta las de los demás', async () => {
    const a = block('sa', 'Bloque A', 0);
    const b = block('sb', 'Bloque B', 1);
    const l1 = row('l1', 'Primera', 'sa', 0);
    const l2 = row('l2', 'Segunda', 'sa', 1);
    const l3 = row('l3', 'Tercera', 'sa', 2);
    const other = row('l4', 'Otra', 'sb', 0);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [l1, l2, l3, other] })
      .mockResolvedValueOnce({ sections: [a, b], lessons: [{ ...l2, position: 0 }, { ...l1, position: 1 }, l3, other] });
    const fixture = await setup();
    await fixture.componentInstance.moveLesson(a, l2, -1);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(repo.reorderSectionLessons).toHaveBeenCalledWith('sa', ['l2', 'l1', 'l3']);
    expect(fixture.componentInstance.lessons().find(item => item.id === 'l4')).toEqual(other);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Lección «Segunda» movida');
    expect(document.activeElement?.getAttribute('data-reorder-key')).toBe('lesson:down:l2');
  });

  it('descarta la respuesta si cambia el curso mientras se reordena', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] });
    let finish!: () => void;
    repo.reorderCourseSections.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.moveSection(b, -1);
    fixture.componentRef.setInput('course', { ...course, id: 'otro' }); fixture.detectChanges();
    finish(); await pending;
    expect(component.sections()).toEqual([a, b]);
    expect(repo.list).toHaveBeenCalledTimes(1);
    expect(component.notice()).toBe('');
  });

  it('descarta la respuesta y no enfoca después de destruir el componente', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] });
    let finish!: () => void;
    repo.reorderSectionLessons.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const fixture = await setup(); const component = fixture.componentInstance;
    const l1 = row('l1', 'Primera', 'sa', 0);
    const l2 = row('l2', 'Segunda', 'sa', 1);
    component.lessons.set([l1, l2]);
    const pending = component.moveLesson(a, l2, -1);
    fixture.destroy();
    finish(); await pending;
    expect(component.lessons()).toEqual([l1, l2]);
    expect(repo.list).toHaveBeenCalledTimes(1);
    expect(component.error()).toBe('');
  });

  it('arrastrar un bloque a otro llama a la RPC con la lista completa y avisa', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    const c = block('sc', 'Gamma', 2);
    repo.list.mockResolvedValueOnce({ sections: [a, b, c], lessons: [] })
      .mockResolvedValueOnce({ sections: [b, c, a], lessons: [] });
    const fixture = await setup(); const component = fixture.componentInstance;
    component.dragSectionStart(fakeDrag(), a);
    component.dragSectionOver(fakeDrag(), c);
    await component.dropSection(fakeDrag(), c);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(repo.reorderCourseSections).toHaveBeenCalledWith('course', ['sb', 'sc', 'sa']);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Bloque movido a la posición 3 de 3.');
    expect(component.dragging()).toBeNull();
    expect(document.activeElement?.getAttribute('data-reorder-key')).toBeNull();
  });

  it('arrastrar una lección dentro de su bloque mueve solo esas lecciones', async () => {
    const a = block('sa', 'Bloque A', 0);
    const l1 = row('l1', 'Primera', 'sa', 0);
    const l2 = row('l2', 'Segunda', 'sa', 1);
    const l3 = row('l3', 'Tercera', 'sa', 2);
    repo.list.mockResolvedValueOnce({ sections: [a], lessons: [l1, l2, l3] })
      .mockResolvedValueOnce({ sections: [a], lessons: [{ ...l3, position: 0 }, l1, { ...l2, position: 2 }] });
    const fixture = await setup(); const component = fixture.componentInstance;
    component.dragLessonStart(fakeDrag(), l1);
    component.dragLessonOver(fakeDrag(), a, l3);
    await component.dropLesson(fakeDrag(), a, l3);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(repo.reorderSectionLessons).toHaveBeenCalledWith('sa', ['l2', 'l3', 'l1']);
    expect(repo.reorderCourseSections).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Lección movida');
  });

  it('rechaza drop de lección en otro bloque o sobre sí misma sin tocar la RPC', async () => {
    const a = block('sa', 'Bloque A', 0);
    const b = block('sb', 'Bloque B', 1);
    const l1 = row('l1', 'Primera', 'sa', 0);
    const l2 = row('l2', 'Segunda', 'sa', 1);
    const other = row('l4', 'Otra', 'sb', 0);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [l1, l2, other] });
    const fixture = await setup(); const component = fixture.componentInstance;
    component.dragLessonStart(fakeDrag(), l1);
    component.dragLessonOver(fakeDrag(), b, other);
    expect(component.dropTarget()).toBeNull();
    await component.dropLesson(fakeDrag(), b, other);
    expect(repo.reorderSectionLessons).not.toHaveBeenCalled();
    component.dragLessonStart(fakeDrag(), l1);
    component.dragLessonOver(fakeDrag(), a, l1);
    await component.dropLesson(fakeDrag(), a, l1);
    expect(repo.reorderSectionLessons).not.toHaveBeenCalled();
    expect(component.lessons()).toEqual([l1, l2, other]);
  });

  it('revierte el drop si falla la RPC y mantiene el mensaje de alerta', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] });
    repo.reorderCourseSections.mockRejectedValueOnce(new Error('forbidden'));
    const fixture = await setup(); const component = fixture.componentInstance;
    component.dragSectionStart(fakeDrag(), a);
    component.dragSectionOver(fakeDrag(), b);
    await component.dropSection(fakeDrag(), b);
    fixture.detectChanges();
    expect(component.sections()).toEqual([a, b]);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No se ha podido reordenar');
  });

  it('un doble drop o filas fantasma no duplican la petición y se limpia al destruir', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [] });
    let finish!: () => void;
    repo.reorderCourseSections.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const fixture = await setup(); const component = fixture.componentInstance;
    component.dragSectionStart(fakeDrag(), a);
    component.dragSectionOver(fakeDrag(), b);
    const first = component.dropSection(fakeDrag(), b);
    await component.dropSection(fakeDrag(), b);
    expect(repo.reorderCourseSections).toHaveBeenCalledTimes(1);
    component.dragSectionStart(fakeDrag(), a);
    fixture.destroy();
    expect(component.dragging()).toBeNull();
    finish(); await first;
    expect(repo.reorderCourseSections).toHaveBeenCalledTimes(1);
  });

  const selectedLabels = (fixture: { nativeElement: HTMLElement }) =>
    [...fixture.nativeElement.querySelectorAll('[aria-current="true"]')]
      .map(item => item.getAttribute('aria-label'));

  it('marca la selección con aria-current y muestra solo los campos del tipo elegido', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    const lesson = row('l1', 'Primera', 'sa', 0);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    expect(selectedLabels(fixture)).toEqual([]);
    component.editSection(a); fixture.detectChanges(); await fixture.whenStable();
    expect(selectedLabels(fixture)).toEqual(['Seleccionar bloque Alfa']);
    expect(fixture.nativeElement.querySelector('#section-title')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#lesson-title')).toBeNull();
    component.editLesson(a, lesson); fixture.detectChanges(); await fixture.whenStable();
    expect(selectedLabels(fixture)).toEqual(['Seleccionar lección Primera, vídeo']);
    expect(fixture.nativeElement.querySelector('#lesson-title')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#lesson-type')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#section-title')).toBeNull();
  });

  it('cambia de selección sin desmontar el outline y enfoca el inspector sin desplazar la lista', async () => {
    const a = block('sa', 'Alfa', 0);
    const lesson = row('l1', 'Primera', 'sa', 0);
    repo.list.mockResolvedValueOnce({ sections: [a], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    const rowBefore = fixture.nativeElement.querySelector('[data-outline-key="section:sa"]');
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    component.editSection(a); fixture.detectChanges(); await fixture.whenStable();
    component.editLesson(a, lesson); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-outline-key="section:sa"]')).toBe(rowBefore);
    expect(document.activeElement?.id).toBe('lesson-title');
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    focusSpy.mockRestore();
  });

  it('plega y despliega bloques, reabre el bloque al seleccionar una lección y conserva el plegado al recargar', async () => {
    const a = block('sa', 'Alfa', 0);
    const lesson = row('l1', 'Primera', 'sa', 0);
    repo.list.mockResolvedValue({ sections: [a], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    const fold = (label: string) => fixture.nativeElement.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
    expect(fold('Plegar bloque Alfa').getAttribute('aria-expanded')).toBe('true');
    fold('Plegar bloque Alfa').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(fold('Desplegar bloque Alfa').getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('[data-outline-key="lesson:l1"]')).toBeNull();
    await component.load(); fixture.detectChanges(); await fixture.whenStable();
    expect(component.isExpanded('sa')).toBe(false);
    component.editLesson(a, lesson); fixture.detectChanges(); await fixture.whenStable();
    expect(component.isExpanded('sa')).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-outline-key="lesson:l1"]')).not.toBeNull();
  });

  it('navega por el outline con flechas y cierra el inspector con Escape sin guardar', async () => {
    const a = block('sa', 'Alfa', 0);
    const b = block('sb', 'Beta', 1);
    const lesson = row('l1', 'Primera', 'sa', 0);
    repo.list.mockResolvedValueOnce({ sections: [a, b], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    const first = fixture.nativeElement.querySelector('[data-outline-key="section:sa"]') as HTMLButtonElement;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-outline-key')).toBe('lesson:l1');
    component.editLesson(a, lesson); fixture.detectChanges(); await fixture.whenStable();
    component.lessonTitle = 'Sin guardar';
    const form = fixture.nativeElement.querySelector('.inspector form') as HTMLFormElement;
    form.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(repo.saveLesson).not.toHaveBeenCalled();
    expect(component.lessonEditor()).toBeNull();
    expect(document.activeElement?.getAttribute('data-outline-key')).toBe('lesson:l1');
  });

  it('devuelve el foco a la lección recién guardada y mantiene el mensaje de guardado', async () => {
    const a = block('sa', 'Alfa', 0);
    const created = row('l-new', 'Nueva', 'sa', 0);
    repo.list.mockResolvedValueOnce({ sections: [a], lessons: [] })
      .mockResolvedValueOnce({ sections: [a], lessons: [created] });
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(a); component.lessonTitle = 'Nueva';
    await component.saveLesson(); fixture.detectChanges(); await fixture.whenStable();
    expect(repo.saveLesson).toHaveBeenCalledWith('course', 'sa',
      { title: 'Nueva', content_type: 'video', is_free_preview: false, is_published: false }, 0, undefined, 'nueva');
    expect(component.selected()).toEqual({ kind: 'lesson', id: 'l-new', sectionId: 'sa' });
    expect(document.activeElement?.getAttribute('data-outline-key')).toBe('lesson:l-new');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Lección guardada.');
  });

  it('sitúa el inspector después del outline en el mismo panel y arranca sin selección', async () => {
    const fixture = await setup();
    const workspace = fixture.nativeElement.querySelector('.structure-workspace') as HTMLElement;
    expect(workspace).not.toBeNull();
    const outline = workspace.querySelector('.outline') as HTMLElement;
    const inspector = workspace.querySelector('.inspector') as HTMLElement;
    expect(outline).not.toBeNull(); expect(inspector).not.toBeNull();
    expect(outline.compareDocumentPosition(inspector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(inspector.textContent).toContain('Selecciona un bloque o una lección para editarlo.');
  });

  it('no muestra resumen ni contenido markdown en ninguno de los dos paneles', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editSection(section); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#section-summary')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Resumen del bloque');
    component.editLesson(section); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#lesson-summary, #lesson-content, #lesson-content-md')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Contenido markdown');
  });

  const rectAt = (top: number, bottom: number): DOMRect =>
    ({ top, bottom, left: 10, right: 200, width: 190, height: bottom - top, x: 10, y: top, toJSON: () => ({}) }) as DOMRect;

  it('acerca el inspector con scrollIntoView solo cuando queda fuera del viewport', async () => {
    const a = block('sa', 'Alfa', 0);
    repo.list.mockResolvedValueOnce({ sections: [a], lessons: [] });
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editSection(a); fixture.detectChanges(); await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('#section-title') as HTMLInputElement;
    const scroll = vi.fn();
    Object.defineProperty(input, 'scrollIntoView', { value: scroll, configurable: true });
    const bounds = vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(rectAt(10, 50));
    component.editSection(a); fixture.detectChanges(); await fixture.whenStable();
    expect(scroll).not.toHaveBeenCalled();
    bounds.mockReturnValue(rectAt(1200, 1300));
    component.editSection(a); fixture.detectChanges(); await fixture.whenStable();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect(document.activeElement?.id).toBe('section-title');
  });

  it('no enfoca ni desplaza una fila seleccionada que ya no está en el outline', async () => {
    const a = block('sa', 'Alfa', 0);
    const lesson = row('l1', 'Primera', 'sa', 0);
    repo.list.mockResolvedValueOnce({ sections: [a], lessons: [lesson] });
    const fixture = await setup(); const component = fixture.componentInstance;
    component.editLesson(a, lesson); fixture.detectChanges(); await fixture.whenStable();
    const selectedRow = fixture.nativeElement.querySelector('[data-outline-key="lesson:l1"]') as HTMLButtonElement;
    const scroll = vi.fn();
    Object.defineProperty(selectedRow, 'scrollIntoView', { value: scroll, configurable: true });
    selectedRow.remove();
    component.cancelEditor(); fixture.detectChanges(); await fixture.whenStable();
    expect(component.lessonEditor()).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('no ofrece como destino la fila de origen al arrastrar lecciones', async () => {
    const a = block('sa', 'Alfa', 0);
    const l1 = row('l1', 'Primera', 'sa', 0);
    const l2 = row('l2', 'Segunda', 'sa', 1);
    repo.list.mockResolvedValueOnce({ sections: [a], lessons: [l1, l2] });
    const fixture = await setup(); const component = fixture.componentInstance;
    const effects = () => [...fixture.nativeElement.querySelectorAll('[aria-dropeffect]')]
      .map((item: HTMLElement) => item.getAttribute('aria-dropeffect'));
    component.dragLessonStart(fakeDrag(), l1);
    fixture.detectChanges();
    expect(effects()).toEqual(['none', 'none', 'move']);
    component.dragEnd(); fixture.detectChanges();
    expect(effects()).toEqual(['none', 'none', 'none']);
  });

  it('aria-controls solo apunta a la lista de lecciones mientras el bloque está desplegado', async () => {
    const a = block('sa', 'Alfa', 0);
    const lesson = row('l1', 'Primera', 'sa', 0);
    repo.list.mockResolvedValueOnce({ sections: [a], lessons: [lesson] });
    const fixture = await setup();
    const fold = () => fixture.nativeElement.querySelector(
      'button[aria-label="Plegar bloque Alfa"], button[aria-label="Desplegar bloque Alfa"]') as HTMLButtonElement;
    expect(fold().getAttribute('aria-controls')).toBe('lessons-sa');
    expect(fixture.nativeElement.querySelector('#lessons-sa')).not.toBeNull();
    fold().click(); fixture.detectChanges(); await fixture.whenStable();
    expect(fold().getAttribute('aria-expanded')).toBe('false');
    expect(fold().hasAttribute('aria-controls')).toBe(false);
    expect(fixture.nativeElement.querySelector('#lessons-sa')).toBeNull();
  });

  const inspectableLesson = '22222222-2222-2222-2222-222222222222';

  async function withLessonInTabs() {
    const lesson = makeLesson(inspectableLesson, 'Lección');
    repo.list.mockResolvedValueOnce({ sections: [section], lessons: [lesson] });
    const fixture = await setup();
    fixture.componentInstance.editLesson(section, lesson);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, lesson };
  }

  it('integra vídeo y materiales en el inspector sin navegar al abrir sus pestañas', async () => {
    const { fixture, lesson } = await withLessonInTabs();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const tab = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLButtonElement;
    expect([...fixture.nativeElement.querySelectorAll('[role="tab"]')]
      .map(item => item.textContent?.trim())).toEqual(['Datos', 'Vídeo', 'Materiales']);
    expect(tab('tab-datos').getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('app-lesson-video')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-lesson-materials')).toBeNull();
    expect(tab('tab-video').hasAttribute('aria-controls')).toBe(false);
    expect(tab('tab-materiales').hasAttribute('aria-controls')).toBe(false);

    tab('tab-video').click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    const video = fixture.debugElement.query(By.directive(LessonVideo));
    expect(video).not.toBeNull();
    expect(video.componentInstance.lessonId()).toBe(lesson.id);
    expect(video.componentInstance.courseId()).toBe('course');
    expect(document.activeElement?.id).toBe('tab-video');
    expect(tab('tab-video').getAttribute('aria-controls')).toBe('panel-video');
    expect(fixture.nativeElement.querySelector('#panel-video').hasAttribute('hidden')).toBe(false);
    expect(fixture.nativeElement.querySelector('#panel-datos').hasAttribute('hidden')).toBe(true);

    tab('tab-materiales').click(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    const materials = fixture.debugElement.query(By.directive(LessonMaterials));
    expect(materials).not.toBeNull();
    expect(materials.componentInstance.lessonId()).toBe(lesson.id);
    expect(document.activeElement?.id).toBe('tab-materiales');
    expect(tab('tab-materiales').getAttribute('aria-controls')).toBe('panel-materiales');
    expect(fixture.nativeElement.querySelector('#panel-video').hasAttribute('hidden')).toBe(true);
    navigate.mockRestore();
  });

  it('conserva un único guardado de datos tras recorrer las pestañas', async () => {
    const { fixture, lesson } = await withLessonInTabs();
    for (const id of ['tab-video', 'tab-materiales', 'tab-datos']) {
      (fixture.nativeElement.querySelector(`#${id}`) as HTMLButtonElement).click();
      fixture.detectChanges(); await fixture.whenStable();
    }
    fixture.componentInstance.lessonTitle = 'Cambio';
    await fixture.componentInstance.saveLesson();
    expect(repo.saveLesson).toHaveBeenCalledTimes(1);
    expect(repo.saveLesson).toHaveBeenCalledWith('course', 'section', {
      title: 'Cambio', content_type: 'video', is_free_preview: false, is_published: false,
    }, 1, lesson, undefined);
  });

  it('monta vídeo y materiales solo al abrirlos y no repite sus lecturas al volver', async () => {
    const { fixture } = await withLessonInTabs();
    const tab = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLButtonElement;
    const statusCalls = () => invoke.mock.calls.filter(call => call[1]?.body?.['action'] === 'status').length;
    expect(statusCalls()).toBe(0);
    expect(listMaterials).not.toHaveBeenCalled();

    tab('tab-video').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(statusCalls()).toBe(1);
    tab('tab-datos').click(); fixture.detectChanges(); await fixture.whenStable();
    const mountedVideo = fixture.debugElement.query(By.directive(LessonVideo)).componentInstance;
    tab('tab-video').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(LessonVideo)).componentInstance).toBe(mountedVideo);
    expect(statusCalls()).toBe(1);

    tab('tab-materiales').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(listMaterials).toHaveBeenCalledTimes(1);
    tab('tab-datos').click(); fixture.detectChanges(); await fixture.whenStable();
    tab('tab-materiales').click(); fixture.detectChanges(); await fixture.whenStable();
    expect(listMaterials).toHaveBeenCalledTimes(1);
  });

  it('recorre las pestañas con el teclado conservando aria-selected y el foco', async () => {
    const { fixture } = await withLessonInTabs();
    const tab = (id: string) => fixture.nativeElement.querySelector(`#${id}`) as HTMLButtonElement;
    tab('tab-datos').focus();
    tab('tab-datos').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('tab-video');
    expect(tab('tab-datos').getAttribute('tabindex')).toBe('-1');
    expect(tab('tab-video').getAttribute('aria-selected')).toBe('true');
    expect(tab('tab-video').getAttribute('aria-controls')).toBe('panel-video');
    expect(fixture.nativeElement.querySelector('#panel-video').getAttribute('aria-labelledby')).toBe('tab-video');

    tab('tab-video').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('tab-materiales');
    tab('tab-materiales').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(document.activeElement?.id).toBe('tab-datos');
    expect(fixture.nativeElement.querySelector('#panel-datos').hasAttribute('hidden')).toBe(false);
  });

  it('el acceso histórico de materiales abre su pestaña y el cierre vuelve a datos', async () => {
    const { fixture, lesson } = await withLessonInTabs();
    fixture.componentInstance.lessonTitle = 'Sin guardar';
    fixture.componentInstance.openMaterials(lesson);
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.activeTab()).toBe('materiales');
    expect(document.activeElement?.id).toBe('materials-heading');
    expect(fixture.componentInstance.lessonTitle).toBe('Sin guardar');
    fixture.componentInstance.closeMaterials();
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.activeTab()).toBe('datos');
    expect(document.activeElement?.textContent).toContain('Estructura:');
  });

  it('deja los enlaces directos como acceso secundario dentro de opciones plegadas', async () => {
    const { fixture } = await withLessonInTabs();
    const legacy = fixture.nativeElement.querySelector('.inspector-legacy') as HTMLElement;
    expect(legacy).not.toBeNull();
    expect((legacy.querySelector('summary') as HTMLElement).textContent).toContain('Enlaces directos');
    expect(legacy.querySelector('a[aria-label="Vídeo de la lección Lección"]')).not.toBeNull();
    expect(legacy.querySelector('button[aria-label="Materiales PDF de Lección"]')).not.toBeNull();
  });
});

describe('Geometría de temas en la estructura', () => {
  const styles = readFileSync('src/app/features/admin/structure/structure.scss', 'utf8');

  function ruleBody(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  }

  it('conserva el inspector a dos paneles y aplica la escala al workspace', () => {
    expect(styles).toMatch(/@media\s*\(min-width:\s*60rem\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(19rem,\s*\.85fr\)/);
    expect(ruleBody('.structure-workspace')).toMatch(/gap:\s*var\(--grid-gap\)/);
    expect(ruleBody('.structure-workspace')).toMatch(/max-width:\s*var\(--content-max-width\)/);
    expect(ruleBody('.outline, .inspector')).toMatch(/padding:\s*var\(--card-pad\)/);
  });

  it('pestañas, filas y chips usan tokens sin perder los 44px ni el foco', () => {
    expect(styles).toMatch(/\.inspector-tabs\s*\{[^}]*gap:\s*var\(--space-1\)/);
    expect(styles).toMatch(/\.inspector-tabs\s*\{[^}]*border-bottom:\s*var\(--border-width\)/);
    expect(styles).toMatch(/\.outline-select, \.outline-fold, \.outline-order__button, \.structure-drag, \.outline-add, \.structure-link\s*\{[^}]*min-width:\s*44px/);
    expect(styles).toMatch(/\.outline-select, \.outline-fold, \.outline-order__button, \.structure-drag, \.outline-add, \.structure-link\s*\{[^}]*min-height:\s*44px/);
    expect(ruleBody('.outline-block, .outline-lesson')).toMatch(/border:\s*var\(--border-width\)/);
    expect(styles).toMatch(/\.structure-section--dragover[^{]*\{[^}]*outline:\s*2px solid var\(--admin-accent\)/);
    expect(styles).not.toMatch(/border-radius:\s*8px/);
    expect(styles).not.toMatch(/border:\s*1px\s+solid/);
    expect(styles).not.toMatch(/--space-\d\s*:/);
  });
});
