import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationPost } from './conversation';
import { ConversationView } from './conversation-view';
import { LessonCommentsError, MAX_COMMENT_LENGTH } from './lesson-comment';

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

function makeRow(overrides: Partial<ConversationPost> = {}): ConversationPost {
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

describe('Vista compartida de conversación', () => {
  const list = vi.fn();
  const create = vi.fn();
  const remove = vi.fn();
  let fixture: ComponentFixture<ConversationView>;
  let root: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue([]);
    create.mockResolvedValue(makeRow());
    remove.mockResolvedValue({ threadDeleted: false });
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(ConversationView);
    fixture.componentRef.setInput('scopeId', LESSON);
    fixture.componentRef.setInput('repository', { list, create, deleteComment: remove });
    root = fixture.nativeElement as HTMLElement;
  });

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** CSS emulado inyectado por Angular, normalizado para consultar reglas declaradas. */
  function styleText(): string {
    return [...document.querySelectorAll('style')]
      .map((s) => s.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim();
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

  function deleteButtonFor(author: string): HTMLButtonElement {
    return [...root.querySelectorAll<HTMLButtonElement>('.delete-button')]
      .find((b) => b.getAttribute('aria-label') === `Eliminar comentario de ${author}`)!;
  }

  function confirmButton(): HTMLButtonElement {
    return buttonWith('Confirmar eliminación');
  }

  function openDelete(author: string): HTMLButtonElement {
    const button = deleteButtonFor(author);
    button.click();
    return button;
  }

  it('carga una sola vez por lección y muestra el estado vacío', async () => {
    await settle();
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(LESSON);
    expect(root.textContent).toContain('Todavía no hay comentarios en esta lección.');
    expect(root.querySelector('[role="status"]')).toBeNull();

    fixture.componentRef.setInput('scopeId', LESSON);
    await settle();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('el esqueleto de carga es decorativo y mantiene un único aviso accesible', async () => {
    let resolve!: (rows: ConversationPost[]) => void;
    list.mockReturnValueOnce(new Promise<ConversationPost[]>(r => { resolve = r; }));
    await settle();
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('list');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando comentarios');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[autofocus]')).toBeNull();
    resolve([]);
  });

  it('muestra carga, alerta reintentable y recarga solo tras pulsar Reintentar', async () => {
    let resolve!: (rows: ConversationPost[]) => void;
    list.mockReturnValueOnce(new Promise<ConversationPost[]>((done) => { resolve = done; }));
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
    let resolveOld!: (rows: ConversationPost[]) => void;
    list.mockReturnValueOnce(new Promise<ConversationPost[]>((done) => { resolveOld = done; }));
    list.mockResolvedValueOnce([makeRow({ id: REPLY, body: 'De la lección nueva' })]);
    await settle();

    fixture.componentRef.setInput('scopeId', OTHER);
    await settle();
    expect(list).toHaveBeenLastCalledWith(OTHER);
    expect(root.textContent).toContain('De la lección nueva');

    resolveOld([makeRow({ id: NEW_ROOT, body: 'Respuesta obsoleta' })]);
    await settle();
    expect(root.textContent).not.toContain('Respuesta obsoleta');
    expect(fixture.componentInstance.posts()).toHaveLength(1);

    let resolvePending!: (rows: ConversationPost[]) => void;
    list.mockReturnValueOnce(new Promise<ConversationPost[]>((done) => { resolvePending = done; }));
    fixture.componentRef.setInput('scopeId', LESSON);
    await settle();
    fixture.destroy();
    resolvePending([makeRow({ body: 'Después de desmontar' })]);
    await Promise.resolve();
    expect(fixture.componentInstance.posts()).toHaveLength(0);
  });

  it('descarta una publicación en vuelo al cambiar de lección y deja el formulario usable', async () => {
    list.mockResolvedValueOnce([makeRow({ id: ROOT, body: 'De la lección anterior' })]);
    list.mockResolvedValueOnce([makeRow({ id: REPLY, body: 'De la lección nueva' })]);
    let resolveCreate!: (row: ConversationPost) => void;
    create.mockReturnValueOnce(new Promise<ConversationPost>((done) => { resolveCreate = done; }));
    await settle();
    expect(root.textContent).toContain('De la lección anterior');

    fixture.componentInstance.draft.set('Comentario en vuelo');
    fixture.detectChanges();
    submitForm('form.comment-form');
    fixture.detectChanges();
    expect(create).toHaveBeenCalledWith(LESSON, 'Comentario en vuelo', null);
    expect(buttonWith('Publicar comentario').disabled).toBe(true);

    fixture.componentRef.setInput('scopeId', OTHER);
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
    expect(fixture.componentInstance.posts().map(item => item.body)).toEqual(['De la lección nueva']);
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

  it('acepta textos configurables sin perder accesibilidad', async () => {
    fixture.componentRef.setInput('heading', 'Respuestas del tema');
    fixture.componentRef.setInput('emptyText', 'Todavía no hay respuestas en este tema.');
    fixture.componentRef.setInput('placeholder', 'Escribe tu respuesta');
    fixture.componentRef.setInput('submitText', 'Publicar respuesta');
    await settle();

    expect(root.querySelector('h2')?.textContent).toContain('Respuestas del tema');
    expect(root.textContent).toContain('Todavía no hay respuestas en este tema.');
    expect(root.querySelector('textarea')?.getAttribute('placeholder')).toBe('Escribe tu respuesta');
    expect(buttonWith('Publicar respuesta')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('section')?.getAttribute('aria-labelledby')).toBe(fixture.componentInstance.headingId);
  });

  describe('distintivo de administrador', () => {
    /** Solo las reglas declaradas para .comment-badge (con el sufijo emulado de Angular). */
    function badgeRules(): string {
      return (styleText().match(/\.comment-badge\[[^\]]*\][^{]*\{[^}]*\}/g) ?? []).join('\n');
    }

    async function seedAdmin(): Promise<HTMLElement> {
      list.mockResolvedValueOnce([makeRow({ authorDisplayName: 'Admin', authorIsAdmin: true })]);
      await settle();
      const badge = root.querySelector<HTMLElement>('.comment-badge')!;
      expect(badge).toBeInstanceOf(HTMLElement);
      return badge;
    }

    it('muestra la estrella y el texto «Administrador» con un aria-label accesible', async () => {
      const badge = await seedAdmin();
      expect(badge.getAttribute('role')).toBe('img');
      expect(badge.getAttribute('aria-label')).toBe('Distintivo de administrador');
      expect(badge.textContent).toContain('Administrador');

      const icon = badge.querySelector<HTMLElement>('.comment-badge__icon')!;
      expect(icon.textContent?.trim()).toBe('★');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect([...badge.querySelectorAll('[aria-hidden="true"]')].map((el) => el.textContent?.trim()))
        .toEqual(['★', 'Administrador']);
    });

    it('declara fondo y borde de acento con texto --accent-ink legible', async () => {
      await seedAdmin();
      const rules = badgeRules();
      expect(rules).toContain('border: 1px solid var(--accent);');
      expect(rules).toContain('background: var(--accent);');
      expect(rules).toContain('color: var(--accent-ink);');
      // Forma y peso refuerzan el distintivo sin depender solo del color.
      expect(rules).toContain('display: inline-flex;');
      expect(rules).toContain('border-radius: 999px;');
      expect(rules).toContain('font-weight: 700;');
      // Se evita la combinación anterior (texto off-white sobre surface claro).
      expect(rules).not.toContain('--admin-warn-text');
      expect(rules).not.toContain('--admin-warn-surface');
      // No se confunde con «Responder» (enlace transparente) ni «Eliminar» (peligro).
      expect(rules).not.toContain('background: transparent;');
      expect(rules).not.toContain('var(--admin-danger');
      // El anillo de foco accesible permanece declarado.
      expect(styleText()).toContain('outline: 3px solid var(--focus)');
    });
  });

  describe('«Responder» con aspecto de enlace de texto', () => {
    /** Solo las reglas declaradas para .reply-button (no la caja de los botones). */
    function replyRules(): string {
      return (styleText().match(/\.reply-button\[[^\]]*\][^{]*\{[^}]*\}/g) ?? []).join('\n');
    }

    async function seedOne(): Promise<HTMLButtonElement> {
      list.mockResolvedValueOnce([makeRow({ authorDisplayName: 'Raíz' })]);
      await settle();
      const button = replyButtonFor('Raíz');
      expect(button).toBeInstanceOf(HTMLButtonElement);
      return button;
    }

    it('no muestra caja, borde ni sombra; usa el color de acento y mantiene 44px de objetivo', async () => {
      const button = await seedOne();
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('aria-label')).toBe('Responder a Raíz');

      const css = getComputedStyle(button);
      expect(css.borderStyle).toBe('none');
      expect(css.borderWidth).toBe('0px');
      expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(css.boxShadow).toBe('none');
      expect(css.color).toBe('var(--accent)');
      expect(css.minHeight).toBe('44px');
    });

    it('declara enlace sin caja ni subrayado, con realce en hover y foco por outline', async () => {
      await seedOne();
      const rules = replyRules();
      expect(rules).toContain('border: 0;');
      expect(rules).toContain('border-radius: 0;');
      expect(rules).toContain('background: transparent;');
      expect(rules).toContain('box-shadow: none;');
      expect(rules).toContain('color: var(--accent);');
      expect(rules).toContain('font: inherit;');
      expect(rules).toContain('text-decoration: none;');
      expect(rules).not.toContain('border: 1px');
      expect(rules).not.toMatch(/text-decoration:\s*underline/);
      expect(rules).toMatch(/:hover[^{]*\{[^}]*filter:\s*brightness\(0\.92\)/);
      // El foco visible con --focus sigue declarado para todos los botones.
      expect(styleText()).toContain('outline: 3px solid var(--focus)');
    });

    it('sigue abriendo el editor con el foco y sin perder el aria-label', async () => {
      const button = await seedOne();
      button.click();
      await settle();
      const textarea = root.querySelector<HTMLTextAreaElement>(`[id="${fixture.componentInstance.replyInputId}"]`)!;
      expect(document.activeElement).toBe(textarea);
      expect(root.querySelector(`label[for="${textarea.id}"]`)?.textContent).toContain('Responder a Raíz');
      expect(replyButtonFor('Raíz').getAttribute('aria-label')).toBe('Responder a Raíz');
    });
  });

  describe('«Eliminar» como enlace rojo junto a «Responder»', () => {
    async function seedModerator(): Promise<{ reply: HTMLButtonElement; del: HTMLButtonElement }> {
      fixture.componentRef.setInput('canModerate', true);
      list.mockResolvedValueOnce([makeRow({ authorDisplayName: 'Raíz' })]);
      await settle();
      return { reply: replyButtonFor('Raíz'), del: deleteButtonFor('Raíz') };
    }

    function deleteRules(): string {
      return (styleText().match(/\.delete-button\[[^\]]*\][^{]*\{[^}]*\}/g) ?? []).join('\n');
    }

    it('comparte el contenedor flex con «Responder», sin salto de línea', async () => {
      const { reply, del } = await seedModerator();
      expect(del).toBeInstanceOf(HTMLButtonElement);
      expect(del.parentElement).toBe(reply.parentElement);
      expect(del.parentElement?.classList.contains('comment-actions-row')).toBe(true);
      expect(reply.parentElement?.querySelectorAll('button')).toHaveLength(2);

      const row = (styleText().match(/\.comment-actions-row\[[^\]]*\][^{]*\{[^}]*\}/g) ?? []).join('\n');
      expect(row).toContain('display: flex;');
      expect(row).toContain('gap: 0.5rem;');
      expect(row).not.toContain('flex-wrap');
    });

    it('es un enlace rojo sin caja, borde ni sombra, con 44px y su aria-label', async () => {
      const { del } = await seedModerator();
      expect(del.tagName).toBe('BUTTON');
      expect(del.getAttribute('type')).toBe('button');
      expect(del.getAttribute('aria-label')).toBe('Eliminar comentario de Raíz');
      expect(del.getAttribute('data-comment-id')).toBe(ROOT);

      const css = getComputedStyle(del);
      expect(css.borderStyle).toBe('none');
      expect(css.borderWidth).toBe('0px');
      expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(css.boxShadow).toBe('none');
      expect(css.minHeight).toBe('44px');
      expect(css.color).toBe('var(--danger, #a53a43)');

      const rules = deleteRules();
      expect(rules).toContain('border: 0;');
      expect(rules).toContain('border-radius: 0;');
      expect(rules).toContain('background: transparent;');
      expect(rules).toContain('box-shadow: none;');
      expect(rules).toContain('font-size: 0.9rem;');
      expect(rules).toContain('color: var(--danger, #a53a43);');
      expect(rules).toContain('font: inherit;');
      expect(rules).not.toContain('border: 1px');
      expect(rules).not.toMatch(/text-decoration:\s*underline/);
      expect(rules).toMatch(/:hover[^{]*\{[^}]*filter:\s*brightness\(0\.92\)/);
      // El anillo de foco accesible sigue declarado para todos los botones.
      expect(styleText()).toContain('outline: 3px solid var(--focus)');
    });

    it('conserva el paso de confirmación como enlace rojo y no borra por error', async () => {
      const { del } = await seedModerator();
      expect(remove).not.toHaveBeenCalled();
      del.click();
      await settle();
      const confirm = confirmButton();
      expect(confirm).toBeInstanceOf(HTMLButtonElement);
      expect(confirm.classList.contains('delete-button--confirm')).toBe(true);
      expect(confirm.getAttribute('data-delete-confirm')).toBe(ROOT);
      expect(remove).not.toHaveBeenCalled();

      const css = getComputedStyle(confirm);
      expect(css.borderStyle).toBe('none');
      expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(css.color).toBe('var(--danger, #a53a43)');
      expect(css.minHeight).toBe('44px');

      buttonWith('Cancelar').click();
      await settle();
      expect(root.querySelector('.delete-confirm')).toBeNull();
      expect(document.activeElement).toBe(del);
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('moderación en la vista compartida', () => {
    async function seed(rows: ConversationPost[]): Promise<void> {
      list.mockResolvedValueOnce(rows);
      await settle();
    }

    it('oculta Eliminar para alumnos y lo ofrece en cada nivel a los administradores', async () => {
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
        makeRow({ id: OTHER_ROOT, parentId: null, createdAt: '2026-11-18T09:00:00Z', authorDisplayName: 'Otra' }),
      ]);
      expect(root.querySelectorAll('.delete-button')).toHaveLength(0);

      fixture.componentRef.setInput('canModerate', true);
      await settle();
      expect([...root.querySelectorAll('.delete-button')].map((b) => b.getAttribute('aria-label'))).toEqual([
        'Eliminar comentario de Otra',
        'Eliminar comentario de Raíz',
        'Eliminar comentario de Hija',
      ]);
      expect(deleteButtonFor('Raíz').textContent?.trim()).toBe('Eliminar');
      // El badge y responder en todos los niveles siguen intactos.
      expect(replyButtonFor('Hija')).toBeInstanceOf(HTMLButtonElement);
      expect(deleteButtonFor('Hija').closest('.comment--reply')).not.toBeNull();
    });

    it('confirma en línea con avisos, foco en Confirmar, Cancelar y Escape devuelven el foco', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
      ]);
      const trigger = openDelete('Raíz');
      await settle();
      const panel = root.querySelector<HTMLElement>('.delete-confirm')!;
      expect(panel.textContent).toContain('¿Eliminar este comentario?');
      expect(panel.textContent).toContain('Se borrará el hilo completo');
      expect(panel.textContent).not.toContain('Se borrarán también sus respuestas');
      expect(confirmButton()).toBeInstanceOf(HTMLButtonElement);
      expect(document.activeElement).toBe(confirmButton());
      expect(remove).not.toHaveBeenCalled();

      buttonWith('Cancelar').click();
      await settle();
      expect(root.querySelector('.delete-confirm')).toBeNull();
      expect(document.activeElement).toBe(trigger);

      const trigger2 = openDelete('Raíz');
      await settle();
      confirmButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
      expect(root.querySelector('.delete-confirm')).toBeNull();
      expect(document.activeElement).toBe(trigger2);
      expect(remove).not.toHaveBeenCalled();
    });

    it('borra una respuesta sin recargar y lleva el foco al comentario siguiente', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
        makeRow({ id: L2B, parentId: L2, createdAt: '2026-11-18T10:02:30Z', authorDisplayName: 'Neta' }),
        makeRow({ id: L3, parentId: ROOT, createdAt: '2026-11-18T10:03:00Z', authorDisplayName: 'Hija 2' }),
      ]);
      openDelete('Hija');
      await settle();
      const panel = root.querySelector<HTMLElement>('.delete-confirm')!;
      expect(panel.textContent).toContain('Se borrarán también sus respuestas');
      expect(panel.textContent).not.toContain('Se borrará el hilo completo');

      confirmButton().click();
      await settle();
      expect(remove).toHaveBeenCalledWith(L2);
      expect(list).toHaveBeenCalledTimes(1);
      expect(node(L2)).toBeNull();
      expect(node(L2B)).toBeNull();
      expect(node(ROOT)).toBeInstanceOf(HTMLElement);
      expect(node(L3)).toBeInstanceOf(HTMLElement);
      expect(root.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain('Comentario eliminado');
      expect(document.activeElement).toBe(node(L3));
    });

    it('quita del árbol local el mensaje y todos sus descendientes', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Intermedia' }),
        makeRow({ id: L3, parentId: L2, createdAt: '2026-11-18T10:03:00Z', authorDisplayName: 'Profunda' }),
        makeRow({ id: OTHER_ROOT, parentId: null, createdAt: '2026-11-18T09:00:00Z', authorDisplayName: 'Otra' }),
      ]);
      openDelete('Intermedia');
      await settle();
      confirmButton().click();
      await settle();
      expect(node(L2)).toBeNull();
      expect(node(L3)).toBeNull();
      expect(node(ROOT)).toBeInstanceOf(HTMLElement);
      expect(node(OTHER_ROOT)).toBeInstanceOf(HTMLElement);
      expect(fixture.componentInstance.posts().map((p) => p.id)).toEqual([ROOT, OTHER_ROOT]);
    });

    it('borra el mensaje raíz con aviso de hilo y foco en el contenedor', async () => {
      fixture.componentRef.setInput('canModerate', true);
      remove.mockResolvedValueOnce({ threadDeleted: true });
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
      ]);
      openDelete('Raíz');
      await settle();
      confirmButton().click();
      await settle();
      expect(remove).toHaveBeenCalledWith(ROOT);
      expect(node(ROOT)).toBeNull();
      expect(node(L2)).toBeNull();
      expect(root.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain('Hilo eliminado');
      expect(document.activeElement).toBe(root.querySelector('[data-conversation-list]'));
    });

    it('muestra error saneado con reintento y permite completar el borrado', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([makeRow({ id: ROOT, authorDisplayName: 'Raíz' })]);
      remove.mockRejectedValueOnce(
        new Error('https://ejemplo.test/rpc?token=secreto&email=alumno@ejemplo.test'),
      );
      openDelete('Raíz');
      await settle();
      confirmButton().click();
      await settle();
      expect(root.querySelector<HTMLElement>('[role="alert"]')?.textContent).toContain('No se pudo eliminar');
      expect(root.textContent).not.toContain('secreto');
      expect(root.textContent).not.toContain('@');
      expect(node(ROOT)).toBeInstanceOf(HTMLElement);
      expect(fixture.componentInstance.deletingId()).toBeNull();

      buttonWith('Reintentar').click();
      await settle();
      expect(remove).toHaveBeenCalledTimes(2);
      expect(node(ROOT)).toBeNull();
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });

    it('bloquea el doble clic y cualquier borrado mientras hay otro en vuelo', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: OTHER_ROOT, parentId: null, createdAt: '2026-11-18T09:00:00Z', authorDisplayName: 'Otra' }),
      ]);
      let resolveRemove!: (value: { threadDeleted: boolean }) => void;
      remove.mockReturnValueOnce(new Promise<{ threadDeleted: boolean }>((done) => { resolveRemove = done; }));
      openDelete('Raíz');
      await settle();
      confirmButton().click();
      await settle();
      expect(deleteButtonFor('Otra').disabled).toBe(true);
      await fixture.componentInstance.confirmDelete(ROOT);
      expect(remove).toHaveBeenCalledTimes(1);
      resolveRemove({ threadDeleted: false });
      await settle();
      expect(deleteButtonFor('Otra').disabled).toBe(false);
    });

    it('limpia confirmación y descarta un borrado en vuelo al cambiar de ámbito', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: OTHER_ROOT, parentId: null, createdAt: '2026-11-18T09:00:00Z', authorDisplayName: 'Otra' }),
      ]);
      let resolveRemove!: (value: { threadDeleted: boolean }) => void;
      remove.mockReturnValueOnce(new Promise<{ threadDeleted: boolean }>((done) => { resolveRemove = done; }));
      openDelete('Raíz');
      await settle();
      confirmButton().click();
      await settle();
      fixture.componentRef.setInput('scopeId', OTHER);
      await settle();
      expect(fixture.componentInstance.confirmingDeleteId()).toBeNull();
      expect(fixture.componentInstance.deletingId()).toBeNull();
      resolveRemove({ threadDeleted: true });
      await settle();
      expect(fixture.componentInstance.posts()).toHaveLength(0);
      expect(root.textContent).not.toContain('Hilo eliminado');
    });

    it('al destruir descarta el resultado de un borrado pendiente', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([makeRow({ id: ROOT, authorDisplayName: 'Raíz' })]);
      let resolveRemove!: (value: { threadDeleted: boolean }) => void;
      remove.mockReturnValueOnce(new Promise<{ threadDeleted: boolean }>((done) => { resolveRemove = done; }));
      openDelete('Raíz');
      await settle();
      confirmButton().click();
      await settle();
      fixture.destroy();
      resolveRemove({ threadDeleted: false });
      await Promise.resolve();
      expect(fixture.componentInstance.posts()).toHaveLength(1);
      expect(fixture.componentInstance.confirmingDeleteId()).toBeNull();
    });

    it('emite threadDeleted solo cuando la RPC confirma el borrado del hilo', async () => {
      const emitted = vi.fn();
      fixture.componentInstance.threadDeleted.subscribe(emitted);
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
      ]);

      openDelete('Hija');
      await settle();
      confirmButton().click();
      await settle();
      expect(emitted).not.toHaveBeenCalled();

      remove.mockResolvedValueOnce({ threadDeleted: true });
      openDelete('Raíz');
      await settle();
      confirmButton().click();
      await settle();
      expect(emitted).toHaveBeenCalledTimes(1);
      expect(emitted).toHaveBeenCalledWith(LESSON);
    });

    it('nunca envía el scopeId del hilo: confirmDelete solo acepta ids del árbol', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([makeRow({ id: ROOT, authorDisplayName: 'Raíz' })]);
      fixture.componentInstance.requestDelete(LESSON, { currentTarget: null } as unknown as Event);
      await settle();
      await fixture.componentInstance.confirmDelete(LESSON);
      expect(remove).not.toHaveBeenCalled();
      expect(fixture.componentInstance.posts().map((post) => post.id)).toEqual([ROOT]);
    });

    it('el aviso de hilo nunca aparece en una respuesta, con o sin hijos', async () => {
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
        makeRow({ id: L2B, parentId: L2, createdAt: '2026-11-18T10:03:00Z', authorDisplayName: 'Neta' }),
      ]);

      openDelete('Hija');
      await settle();
      const panel = root.querySelector<HTMLElement>('.delete-confirm')!;
      expect(panel.textContent).toContain('Se borrarán también sus respuestas');
      expect(panel.textContent).not.toContain('Se borrará el hilo completo');
      expect(confirmButton().getAttribute('data-delete-confirm')).toBe(L2);

      openDelete('Neta');
      await settle();
      const leafPanel = root.querySelector<HTMLElement>('.delete-confirm')!;
      expect(leafPanel.textContent).not.toContain('Se borrarán también sus respuestas');
      expect(leafPanel.textContent).not.toContain('Se borrará el hilo completo');
      expect(confirmButton().getAttribute('data-delete-confirm')).toBe(L2B);
    });

    it('un thread_deleted erróneo en una respuesta no elimina el hilo ni emite', async () => {
      const emitted = vi.fn();
      fixture.componentInstance.threadDeleted.subscribe(emitted);
      remove.mockResolvedValueOnce({ threadDeleted: true });
      fixture.componentRef.setInput('canModerate', true);
      await seed([
        makeRow({ id: ROOT, authorDisplayName: 'Raíz' }),
        makeRow({ id: L2, parentId: ROOT, createdAt: '2026-11-18T10:02:00Z', authorDisplayName: 'Hija' }),
      ]);

      openDelete('Hija');
      await settle();
      confirmButton().click();
      await settle();
      expect(remove).toHaveBeenCalledWith(L2);
      expect(remove).not.toHaveBeenCalledWith(LESSON);
      expect(emitted).not.toHaveBeenCalled();
      expect(node(ROOT)).toBeInstanceOf(HTMLElement);
      expect(node(L2)).toBeNull();
      expect(root.querySelector('[role="status"][aria-live="polite"]')?.textContent)
        .toContain('Comentario eliminado');
    });

    it('permite desactivar el aviso de hilo en las dudas de lección', async () => {
      fixture.componentRef.setInput('canModerate', true);
      fixture.componentRef.setInput('rootDeletesThread', false);
      await seed([makeRow({ id: ROOT, authorDisplayName: 'Raíz' })]);
      openDelete('Raíz');
      await settle();
      expect(root.querySelector('.delete-confirm')?.textContent).not.toContain('Se borrará el hilo completo');
    });
  });
});
