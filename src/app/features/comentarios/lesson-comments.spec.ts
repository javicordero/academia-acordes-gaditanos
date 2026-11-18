import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonComment, LessonCommentsError, MAX_COMMENT_LENGTH } from './lesson-comment';
import { LessonCommentsRepository } from './lesson-comments-repository';
import { LessonComments } from './lesson-comments';

const LESSON = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ROOT = '11111111-1111-1111-1111-111111111111';
const REPLY = '22222222-2222-2222-2222-222222222222';
const NEW_ROOT = '33333333-3333-3333-3333-333333333333';
const L2 = '44444444-4444-4444-4444-444444444444';
const L2B = '55555555-5555-5555-5555-555555555555';
const L3 = '66666666-6666-6666-6666-666666666666';
const L4 = '77777777-7777-7777-7777-777777777777';
const L5 = '88888888-8888-8888-8888-888888888888';
const L6 = '99999999-9999-9999-9999-999999999999';
const OTHER_ROOT = 'abababab-abab-abab-abab-abababababab';

function makeRow(overrides: Partial<LessonComment> = {}): LessonComment {
  return {
    id: ROOT,
    parentId: null,
    body: 'Una duda sobre el rasgueo',
    createdAt: '2026-11-18T10:00:00Z',
    authorDisplayName: 'Alumno',
    authorIsAdmin: false,
    ...overrides,
  };
}

describe('Comentarios de una lección', () => {
  const list = vi.fn();
  const create = vi.fn();
  let fixture: ComponentFixture<LessonComments>;
  let root: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue([]);
    create.mockResolvedValue(makeRow());
    TestBed.configureTestingModule({
      providers: [{ provide: LessonCommentsRepository, useValue: { list, create } }],
    });
    fixture = TestBed.createComponent(LessonComments);
    fixture.componentRef.setInput('lessonId', LESSON);
    root = fixture.nativeElement as HTMLElement;
  });

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function buttonWith(label: string): HTMLButtonElement {
    return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
  }

  function submitForm(selector: string): void {
    root.querySelector<HTMLFormElement>(selector)!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  }

  function node(id: string): HTMLElement {
    return root.querySelector<HTMLElement>(`[data-comment-id="${id}"]`)!;
  }

  function replyButtonFor(author: string): HTMLButtonElement {
    return [...root.querySelectorAll<HTMLButtonElement>('.reply-button')]
      .find((b) => b.getAttribute('aria-label') === `Responder a ${author}`)!;
  }

  it('carga una sola vez por lección y muestra el estado vacío', async () => {
    await settle();
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(LESSON);
    expect(root.textContent).toContain('Todavía no hay comentarios en esta lección.');
    expect(root.querySelector('[role="status"]')).toBeNull();

    fixture.componentRef.setInput('lessonId', LESSON);
    await settle();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('muestra carga, alerta reintentable y recarga solo tras pulsar Reintentar', async () => {
    let resolve!: (rows: LessonComment[]) => void;
    list.mockReturnValueOnce(new Promise<LessonComment[]>((done) => { resolve = done; }));
    await settle();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando comentarios');
    expect(list).toHaveBeenCalledTimes(1);

    list.mockRejectedValueOnce(new LessonCommentsError('failed'));
    fixture.componentInstance.reload();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    expect(root.textContent).not.toContain('https://');
    expect(buttonWith('Reintentar')).toBeInstanceOf(HTMLButtonElement);

    list.mockResolvedValueOnce([makeRow()]);
    buttonWith('Reintentar').click();
    await settle();
    expect(list).toHaveBeenCalledTimes(3);
    expect(root.textContent).toContain('Una duda sobre el rasgueo');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    resolve([]);
  });

  it('oculta por completo la sección cuando el servidor niega el acceso', async () => {
    list.mockRejectedValueOnce(new LessonCommentsError('forbidden'));
    await settle();
    expect(root.querySelector('section')).toBeNull();
    expect(root.textContent).not.toContain('Comentarios de la lección');
    expect(root.textContent).not.toContain('acceso');
  });

  it('publica un comentario raíz, limita la longitud y lleva el foco al mensaje nuevo', async () => {
    list.mockResolvedValueOnce([makeRow()]);
    create.mockResolvedValueOnce(makeRow({ id: NEW_ROOT, body: 'Mi comentario' }));
    await settle();

    const submit = buttonWith('Publicar comentario');
    expect(submit.disabled).toBe(true);
    fixture.componentInstance.draft.set('x'.repeat(MAX_COMMENT_LENGTH + 1));
    fixture.detectChanges();
    expect(buttonWith('Publicar comentario').disabled).toBe(true);
    fixture.componentInstance.draft.set('  Mi comentario  ');
    fixture.detectChanges();
    expect(buttonWith('Publicar comentario').disabled).toBe(false);

    submitForm('form.comment-form');
    await settle();
    expect(create).toHaveBeenCalledWith(LESSON, 'Mi comentario', null);
    expect(root.querySelector<HTMLElement>(`[data-comment-id="${NEW_ROOT}"]`)?.textContent).toContain('Mi comentario');
    expect(root.querySelector<HTMLElement>('[role="status"][aria-live="polite"]')?.textContent).toContain('Comentario publicado');
    expect(document.activeElement).toBe(root.querySelector(`[data-comment-id="${NEW_ROOT}"]`));
    expect(fixture.componentInstance.draft()).toBe('');
  });

  it('mantiene la sección visible y muestra el comentario nuevo sin recargar cuando la lista estaba vacía', async () => {
    list.mockResolvedValueOnce([]);
    create.mockResolvedValueOnce(makeRow({ id: NEW_ROOT, body: 'Primer comentario' }));
    await settle();

    const section = root.querySelector<HTMLElement>('section.lesson-comments')!;
    expect(section).toBeInstanceOf(HTMLElement);
    expect(root.textContent).toContain('Todavía no hay comentarios en esta lección.');

    fixture.componentInstance.draft.set('Primer comentario');
    fixture.detectChanges();
    submitForm('form.comment-form');
    await settle();

    expect(list).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(root.querySelector('section.lesson-comments')).toBeInstanceOf(HTMLElement);
    expect(root.textContent).not.toContain('Todavía no hay comentarios en esta lección.');
    const node = root.querySelector<HTMLElement>(`[data-comment-id="${NEW_ROOT}"]`);
    expect(node?.textContent).toContain('Primer comentario');
    expect(document.activeElement).toBe(node);
    expect(section.getAttribute('aria-labelledby')).toBe(fixture.componentInstance.headingId);
    expect(root.querySelector<HTMLElement>('h2')?.id).toBe(fixture.componentInstance.headingId);
    expect(root.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain('Comentario publicado');
  });

  it('no oculta la sección si la fila devuelta al publicar no valida', async () => {
    list.mockResolvedValueOnce([]);
    create.mockRejectedValueOnce(new LessonCommentsError('invalid'));
    await settle();

    fixture.componentInstance.draft.set('Comentario con forma inesperada');
    fixture.detectChanges();
    submitForm('form.comment-form');
    await settle();

    expect(root.querySelector('section.lesson-comments')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No se pudo publicar');
    expect(fixture.componentInstance.publishing()).toBe(false);
  });

  it('publica una respuesta y muestra el distintivo de administrador también en el hilo', async () => {
    list.mockResolvedValueOnce([makeRow({ body: '<img src=x onerror=alert(1)>' , authorDisplayName: '<b>Admin</b>', authorIsAdmin: true,
      ...({ email: 'alumno@ejemplo.test' } as object) })]);
    create.mockResolvedValueOnce(makeRow({ id: REPLY, parentId: ROOT, body: 'Gracias', authorIsAdmin: true }));
    await settle();

    const badge = root.querySelector<HTMLElement>('.comment-badge')!;
    expect(badge.textContent).toContain('Administrador');
    expect(badge.getAttribute('aria-label')).toBe('Distintivo de administrador');
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(root.querySelector('img, b')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.textContent).not.toContain('alumno@ejemplo.test');
    expect(root.textContent).not.toContain(ROOT);

    buttonWith('Responder').click();
    await settle();
    const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute('aria-label')).toBeNull();
    expect(root.querySelector('label[for="' + textarea.id + '"]')?.textContent).toContain('Responder a <b>Admin</b>');

    fixture.componentInstance.replyDraft.set(' Gracias ');
    fixture.detectChanges();
    submitForm('form.comment-form--reply');
    await settle();
    expect(create).toHaveBeenCalledWith(LESSON, 'Gracias', ROOT);
    const replyNode = root.querySelector<HTMLElement>(`.comment--reply[data-comment-id="${REPLY}"]`)!;
    expect(replyNode.textContent).toContain('Gracias');
    expect(replyNode.textContent).toContain('Administrador');
    // Toda respuesta puede contestarse: el mismo nombre accesible en cada nivel.
    expect(replyNode.querySelector('.reply-button')?.getAttribute('aria-label')).toBe('Responder a Alumno');
    expect(document.activeElement).toBe(replyNode);
    expect([...root.querySelectorAll('.reply-button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Responder a <b>Admin</b>',
      'Responder a Alumno',
    ]);
  });

  it('descarta respuestas tardías al cambiar de lección y al destruir el componente', async () => {
    let resolveOld!: (rows: LessonComment[]) => void;
    list.mockReturnValueOnce(new Promise<LessonComment[]>((done) => { resolveOld = done; }));
    list.mockResolvedValueOnce([makeRow({ id: REPLY, body: 'De la lección nueva' })]);
    await settle();

    fixture.componentRef.setInput('lessonId', OTHER);
    await settle();
    expect(list).toHaveBeenLastCalledWith(OTHER);
    expect(root.textContent).toContain('De la lección nueva');

    resolveOld([makeRow({ id: NEW_ROOT, body: 'Respuesta obsoleta' })]);
    await settle();
    expect(root.textContent).not.toContain('Respuesta obsoleta');
    expect(fixture.componentInstance.comments()).toHaveLength(1);

    let resolvePending!: (rows: LessonComment[]) => void;
    list.mockReturnValueOnce(new Promise<LessonComment[]>((done) => { resolvePending = done; }));
    fixture.componentRef.setInput('lessonId', LESSON);
    await settle();
    fixture.destroy();
    resolvePending([makeRow({ body: 'Después de desmontar' })]);
    await Promise.resolve();
    expect(fixture.componentInstance.comments()).toHaveLength(0);
  });

  it('descarta una publicación en vuelo al cambiar de lección y deja el formulario usable', async () => {
    list.mockResolvedValueOnce([makeRow({ id: ROOT, body: 'De la lección anterior' })]);
    list.mockResolvedValueOnce([makeRow({ id: REPLY, body: 'De la lección nueva' })]);
    let resolveCreate!: (row: LessonComment) => void;
    create.mockReturnValueOnce(new Promise<LessonComment>((done) => { resolveCreate = done; }));
    await settle();
    expect(root.textContent).toContain('De la lección anterior');

    fixture.componentInstance.draft.set('Comentario en vuelo');
    fixture.detectChanges();
    submitForm('form.comment-form');
    fixture.detectChanges();
    expect(create).toHaveBeenCalledWith(LESSON, 'Comentario en vuelo', null);
    expect(buttonWith('Publicar comentario').disabled).toBe(true);

    fixture.componentRef.setInput('lessonId', OTHER);
    await settle();
    expect(list).toHaveBeenLastCalledWith(OTHER);
    expect(fixture.componentInstance.publishing()).toBe(false);
    expect(root.textContent).toContain('De la lección nueva');
    expect(root.textContent).not.toContain('Comentario en vuelo');

    fixture.componentInstance.draft.set('Comentario de la nueva');
    fixture.detectChanges();
    expect(buttonWith('Publicar comentario').disabled).toBe(false);

    resolveCreate(makeRow({ id: NEW_ROOT, body: 'Publicación obsoleta' }));
    await settle();
    expect(create).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.comments().map(item => item.body)).toEqual(['De la lección nueva']);
    expect(root.textContent).not.toContain('Publicación obsoleta');
    expect(fixture.componentInstance.publishing()).toBe(false);
    expect(buttonWith('Publicar comentario').disabled).toBe(false);
  });

  it('construye el árbol completo de cuatro niveles ordenado por created_at', async () => {
    list.mockResolvedValueOnce([
      makeRow({ id: L4, parentId: L3, createdAt: '2026-11-18T10:04:00Z', authorDisplayName: 'Nivel 4' }),
      makeRow({ id: ROOT, parentId: null, createdAt: '2026-11-18T10:00:00Z', authorDisplayName: 'Raíz' }),
      makeRow({ id: L3, parentId: L2, createdAt: '2026-11-18T10:03:00Z', authorDisplayName: 'Nivel 3' }),
      makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Nivel 2' }),
      makeRow({ id: OTHER_ROOT, parentId: null, createdAt: '2026-11-18T09:00:00Z', authorDisplayName: 'Otra raíz' }),
      makeRow({ id: L2B, parentId: ROOT, createdAt: '2026-11-18T10:01:00Z', authorDisplayName: 'Nivel 2 b' }),
    ]);
    await settle();

    expect([...root.querySelectorAll('.comment')].map((n) => n.getAttribute('data-comment-id')))
      .toEqual([OTHER_ROOT, ROOT, L2B, L2, L3, L4]);
    expect([...root.querySelectorAll('.comment')].map((n) => n.getAttribute('aria-level')))
      .toEqual(['1', '1', '2', '2', '3', '4']);
    expect(node(L4).classList.contains('comment--reply')).toBe(true);
    expect(root.querySelectorAll('.comment--root')).toHaveLength(2);
  });

  it('responder a una respuesta usa su id como padre y la coloca anidada sin recargar', async () => {
    list.mockResolvedValueOnce([
      makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
      makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Intermedia' }),
      makeRow({ id: L3, parentId: L2, createdAt: '2026-11-18T10:03:00Z', authorDisplayName: 'Profunda' }),
    ]);
    create.mockResolvedValueOnce(makeRow({
      id: NEW_ROOT, parentId: L3, body: 'Cuarta respuesta',
      createdAt: '2026-11-18T10:05:00Z', authorDisplayName: 'Alumno',
    }));
    await settle();

    replyButtonFor('Profunda').click();
    await settle();
    const textarea = root.querySelector<HTMLTextAreaElement>(`[id="${fixture.componentInstance.replyInputId}"]`)!;
    expect(document.activeElement).toBe(textarea);
    expect(root.querySelector(`label[for="${textarea.id}"]`)?.textContent).toContain('Responder a Profunda');

    fixture.componentInstance.replyDraft.set(' Cuarta respuesta ');
    fixture.detectChanges();
    submitForm('form.comment-form--reply');
    await settle();

    expect(create).toHaveBeenCalledWith(LESSON, 'Cuarta respuesta', L3);
    expect(list).toHaveBeenCalledTimes(1);
    const newNode = node(NEW_ROOT);
    expect(newNode.textContent).toContain('Cuarta respuesta');
    expect(newNode.getAttribute('aria-level')).toBe('4');
    expect(newNode.closest('.comment-list--replies')?.getAttribute('aria-label')).toBe('Respuestas a Profunda');
    expect(document.activeElement).toBe(newNode);
    expect(fixture.componentInstance.publishing()).toBe(false);
  });

  it('topa el sangrado visual sin limitar la profundidad de los datos', async () => {
    const parents = [ROOT, L2, L3, L4, L5];
    list.mockResolvedValueOnce([
      makeRow({ id: ROOT, authorDisplayName: 'N0' }),
      ...[L2, L3, L4, L5, L6].map((id, i) => makeRow({
        id,
        parentId: parents[i],
        createdAt: `2026-11-18T10:0${i + 2}:00Z`,
        authorDisplayName: `N${i + 1}`,
      })),
    ]);
    await settle();

    expect(root.querySelectorAll('.comment')).toHaveLength(6);
    expect([...root.querySelectorAll('.comment-list--replies')].map((ul) =>
      [...ul.classList].find((c) => c.startsWith('depth-')),
    )).toEqual(['depth-1', 'depth-2', 'depth-3', 'depth-4', 'depth-cap']);
    expect(root.querySelector('.depth-5')).toBeNull();
  });

  it('muestra el badge y enfoca el editor en cualquier profundidad, con targets de 44px', async () => {
    list.mockResolvedValueOnce([
      makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
      makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Intermedia' }),
      makeRow({ id: L3, parentId: L2, createdAt: '2026-11-18T10:03:00Z', authorDisplayName: 'Admin profunda', authorIsAdmin: true }),
    ]);
    await settle();

    const deep = node(L3);
    expect(deep.querySelector('.comment-badge')?.textContent).toContain('Administrador');
    expect(deep.querySelector('.comment-badge')?.getAttribute('aria-label')).toBe('Distintivo de administrador');

    replyButtonFor('Admin profunda').click();
    await settle();
    const textarea = root.querySelector<HTMLTextAreaElement>(`[id="${fixture.componentInstance.replyInputId}"]`)!;
    expect(document.activeElement).toBe(textarea);
    expect(replyButtonFor('Admin profunda').closest('.comment')).toBe(deep);
    expect(getComputedStyle(replyButtonFor('Admin profunda')).minHeight).toBe('44px');
  });

  it('un error al publicar dentro del hilo no oculta la conversación', async () => {
    list.mockResolvedValueOnce([
      makeRow({ id: ROOT }),
      makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
    ]);
    create.mockRejectedValueOnce(new LessonCommentsError('invalid'));
    await settle();

    replyButtonFor('Hija').click();
    await settle();
    fixture.componentInstance.replyDraft.set('Texto que falla');
    fixture.detectChanges();
    submitForm('form.comment-form--reply');
    await settle();

    expect(root.querySelector('section.lesson-comments')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No se pudo publicar la respuesta');
    expect(fixture.componentInstance.publishing()).toBe(false);
  });
});
