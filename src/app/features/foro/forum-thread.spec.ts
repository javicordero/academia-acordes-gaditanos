import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ConversationError } from '../comentarios/conversation';
import { ConversationView } from '../comentarios/conversation-view';
import { ForumModerationState } from './forum-moderation-state';
import { ForumThread } from './forum-thread';
import { ForumThreadRepository } from './forum-thread-repository';

const CATEGORY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ROOT = '11111111-1111-1111-1111-111111111111';
const REPLY = '22222222-2222-2222-2222-222222222222';
const NEW = '33333333-3333-3333-3333-333333333333';
const CHILD = '44444444-4444-4444-4444-444444444444';

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOT, parentId: null, body: 'Duda del tema', createdAt: '2026-11-18T10:00:00Z',
    authorDisplayName: 'Profesor', authorIsAdmin: true, ...overrides,
  };
}

describe('Pantalla de un hilo del foro', () => {
  const list = vi.fn();
  const create = vi.fn();
  const remove = vi.fn();
  const isAdmin = signal(false);
  let harness: RouterTestingHarness;
  let text: () => string;

  beforeEach(async () => {
    vi.clearAllMocks();
    isAdmin.set(false);
    list.mockResolvedValue([post()]);
    create.mockResolvedValue(post({ id: NEW, parentId: ROOT, body: 'Gracias', authorIsAdmin: false }));
    remove.mockResolvedValue({ threadDeleted: false });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'comunidad/:categoryId/:threadId', component: ForumThread }]),
        { provide: ForumThreadRepository, useValue: { list, create, deleteComment: remove } },
        { provide: AuthService, useValue: { isAdmin } },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/comunidad/${CATEGORY}/${THREAD}`, ForumThread);
    await harness.fixture.whenStable();
    harness.detectChanges();
    text = () => harness.routeNativeElement?.textContent ?? '';
  });

  function view(): ConversationView {
    return harness.fixture.debugElement.query(By.directive(ConversationView)).componentInstance as ConversationView;
  }

  function deleteButtonFor(author: string): HTMLButtonElement {
    return [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.delete-button')]
      .find((b) => b.getAttribute('aria-label') === `Eliminar comentario de ${author}`)!;
  }

  function confirmButton(): HTMLButtonElement {
    return [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Confirmar eliminación')!;
  }

  function deleteButtonById(id: string): HTMLButtonElement {
    return harness.routeNativeElement!.querySelector<HTMLButtonElement>(
      `button.delete-button:not(.delete-button--confirm)[data-comment-id="${id}"]`,
    )!;
  }

  async function asAdmin(): Promise<void> {
    isAdmin.set(true);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(view().canModerate()).toBe(true);
  }

  it('usa la vista compartida con el tema como ámbito y textos del foro', () => {
    expect(harness.routeNativeElement?.querySelectorAll('h1')).toHaveLength(1);
    expect(harness.routeNativeElement?.querySelectorAll('app-conversation-view')).toHaveLength(1);
    expect(view().scopeId()).toBe(THREAD);
    expect(view().heading()).toBe('Respuestas del tema');
    expect(view().emptyText()).toBe('Todavía no hay respuestas en este tema.');
    expect(view().submitText()).toBe('Publicar respuesta');
    expect(list).toHaveBeenCalledWith(THREAD);
    expect(harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a')?.getAttribute('href'))
      .toBe(`/comunidad/${CATEGORY}`);
    expect(text()).toContain('Duda del tema');
  });

  it('muestra el badge de administrador y permite responder anidado con foco', async () => {
    list.mockResolvedValueOnce([post(), post({
      id: REPLY, parentId: ROOT, body: 'Respuesta previa', authorDisplayName: 'Alumno',
      authorIsAdmin: false, createdAt: '2026-11-18T10:01:00Z',
    })]);
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();

    const badge = harness.routeNativeElement?.querySelector<HTMLElement>('.comment-badge')!;
    expect(badge.textContent).toContain('Administrador');
    expect(badge.getAttribute('aria-label')).toBe('Distintivo de administrador');
    const deep = harness.routeNativeElement?.querySelector<HTMLElement>(`[data-comment-id="${REPLY}"]`)!;
    expect(deep.getAttribute('aria-level')).toBe('2');
    expect(deep.querySelector('.reply-button')?.getAttribute('aria-label')).toBe('Responder a Alumno');

    deep.querySelector<HTMLButtonElement>('.reply-button')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const textarea = harness.routeNativeElement?.querySelector<HTMLTextAreaElement>('form.comment-form--reply textarea')!;
    expect(document.activeElement).toBe(textarea);

    const listsBeforePublishing = list.mock.calls.length;
    view().replyDraft.set('  Gracias  ');
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLFormElement>('form.comment-form--reply')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(create).toHaveBeenCalledWith(THREAD, 'Gracias', REPLY);
    expect(list).toHaveBeenCalledTimes(listsBeforePublishing);
    const created = harness.routeNativeElement?.querySelector<HTMLElement>(`[data-comment-id="${NEW}"]`)!;
    expect(created.textContent).toContain('Gracias');
    expect(document.activeElement).toBe(created);
  });

  it('empty, error reintentable y ocultación por permisos', async () => {
    list.mockResolvedValueOnce([]);
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).toContain('Todavía no hay respuestas en este tema.');

    list.mockRejectedValueOnce(new Error('https://ejemplo.test?token=secreto'));
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    expect(text()).not.toContain('secreto');

    list.mockRejectedValueOnce(new ConversationError('forbidden'));
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('section')).toBeNull();
    expect(text()).not.toContain('Respuestas del tema');
  });

  it('pasa canModerate desde AuthService y delega el borrado al repositorio del foro', async () => {
    expect(view().canModerate()).toBe(false);
    expect(view().rootDeletesThread()).toBe(true);

    isAdmin.set(true);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(view().canModerate()).toBe(true);
    expect(harness.routeNativeElement?.querySelector<HTMLButtonElement>('.delete-button')?.getAttribute('aria-label'))
      .toBe('Eliminar comentario de Profesor');

    await view().repository().deleteComment(ROOT);
    expect(remove).toHaveBeenCalledWith(ROOT);
  });

  it('borra una respuesta con el contrato real y la quita del DOM sin recargar', async () => {
    list.mockResolvedValueOnce([
      post(),
      post({ id: REPLY, parentId: ROOT, body: 'Respuesta que se borra',
        authorDisplayName: 'Alumno', authorIsAdmin: false, createdAt: '2026-11-18T10:01:00Z' }),
      post({ id: NEW, parentId: ROOT, body: 'Respuesta que queda',
        authorDisplayName: 'Otro', authorIsAdmin: false, createdAt: '2026-11-18T10:02:00Z' }),
    ]);
    remove.mockResolvedValueOnce({ threadDeleted: false });
    await asAdmin();
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const callsBefore = list.mock.calls.length;

    deleteButtonFor('Alumno').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(document.activeElement).toBe(confirmButton());
    confirmButton().click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(remove).toHaveBeenCalledWith(REPLY);
    expect(list).toHaveBeenCalledTimes(callsBefore);
    expect(text()).not.toContain('Respuesta que se borra');
    expect(text()).toContain('Respuesta que queda');
    expect(harness.routeNativeElement?.querySelector('[role="status"][aria-live="polite"]')?.textContent)
      .toContain('Comentario eliminado');
    expect(document.activeElement?.getAttribute('data-comment-id')).toBe(NEW);
  });

  it('borra la raíz, marca el hilo eliminado y muestra estado claro con enlace', async () => {
    remove.mockResolvedValueOnce({ threadDeleted: true });
    await asAdmin();
    const moderation = TestBed.inject(ForumModerationState);
    expect(moderation.deletedThreadIds().has(THREAD)).toBe(false);

    deleteButtonFor('Profesor').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    confirmButton().click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(remove).toHaveBeenCalledWith(ROOT);
    expect(moderation.deletedThreadIds().has(THREAD)).toBe(true);
    expect(text()).toContain('Hilo eliminado');
    expect(harness.routeNativeElement?.querySelector('app-conversation-view')).toBeNull();
    expect(harness.routeNativeElement?.querySelector<HTMLAnchorElement>(`a[href="/comunidad/${CATEGORY}"]`))
      .not.toBeNull();
  });

  it('un fallo de RPC conserva el mensaje en el DOM y muestra alerta saneada', async () => {
    remove.mockRejectedValueOnce(new Error('https://ejemplo.test/rpc?token=secreto&email=alumno@ejemplo.test'));
    await asAdmin();
    deleteButtonFor('Profesor').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    confirmButton().click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(text()).toContain('Duda del tema');
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent)
      .toContain('No se pudo eliminar');
    expect(text()).not.toContain('secreto');
    expect(text()).not.toContain('@');
  });

  it('bloquea el doble clic mientras la RPC del foro está en vuelo', async () => {
    let resolveRemove!: (value: { threadDeleted: boolean }) => void;
    remove.mockReturnValueOnce(new Promise<{ threadDeleted: boolean }>((done) => { resolveRemove = done; }));
    await asAdmin();
    deleteButtonFor('Profesor').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    confirmButton().click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    await view().confirmDelete(ROOT);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(deleteButtonFor('Profesor').disabled).toBe(true);
    resolveRemove({ threadDeleted: false });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).not.toContain('Duda del tema');
  });

  it('la confirmación de una respuesta nunca avisa de hilo y envía solo su post.id', async () => {
    list.mockResolvedValueOnce([
      post(),
      post({ id: REPLY, parentId: ROOT, authorDisplayName: 'Alumno', authorIsAdmin: false,
        body: 'Respuesta a borrar', createdAt: '2026-11-18T10:01:00Z' }),
      post({ id: CHILD, parentId: REPLY, authorDisplayName: 'Nieta', authorIsAdmin: false,
        body: 'Nieta que también se borra', createdAt: '2026-11-18T10:01:30Z' }),
      post({ id: NEW, parentId: ROOT, authorDisplayName: 'Otro', authorIsAdmin: false,
        body: 'Respuesta que permanece', createdAt: '2026-11-18T10:02:00Z' }),
    ]);
    remove.mockResolvedValueOnce({ threadDeleted: false });
    await asAdmin();
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();

    deleteButtonFor('Alumno').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const panel = harness.routeNativeElement?.querySelector<HTMLElement>('.delete-confirm')!;
    expect(panel.textContent).toContain('Se borrarán también sus respuestas');
    expect(panel.textContent).not.toContain('Se borrará el hilo completo');
    expect(confirmButton().getAttribute('data-delete-confirm')).toBe(REPLY);
    confirmButton().click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(remove).toHaveBeenCalledWith(REPLY);
    expect(remove).not.toHaveBeenCalledWith(THREAD);
    expect(remove).not.toHaveBeenCalledWith(ROOT);
    expect(text()).toContain('Duda del tema');
    expect(text()).toContain('Respuesta que permanece');
    expect(text()).not.toContain('Respuesta a borrar');
    expect(text()).not.toContain('Nieta que también se borra');
    expect(harness.routeNativeElement?.querySelector('app-conversation-view')).not.toBeNull();
    expect(TestBed.inject(ForumModerationState).deletedThreadIds().has(THREAD)).toBe(false);
  });

  it('DOM real con autor repetido: Eliminar de S envía S, no el id de R', async () => {
    list.mockResolvedValueOnce([
      post({ id: ROOT, parentId: null, body: 'Mensaje raíz',
        authorDisplayName: 'Profesor', authorIsAdmin: true }),
      post({ id: REPLY, parentId: ROOT, body: 'Respuesta del profesor',
        authorDisplayName: 'Profesor', authorIsAdmin: true, createdAt: '2026-11-18T10:01:00Z' }),
    ]);
    remove.mockResolvedValueOnce({ threadDeleted: false });
    await asAdmin();
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();

    // Causa del E2E: ambos botones comparten nombre accesible; el selector estable es data-comment-id.
    expect([...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button.delete-button')]
      .filter((b) => b.getAttribute('aria-label') === 'Eliminar comentario de Profesor')).toHaveLength(2);

    deleteButtonById(REPLY).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const panel = harness.routeNativeElement!.querySelector<HTMLElement>('.delete-confirm')!;
    expect(panel.closest('[data-comment-id]')?.getAttribute('data-comment-id')).toBe(REPLY);
    expect(panel.textContent).not.toContain('Se borrará el hilo completo');
    expect(confirmButton().getAttribute('data-comment-id')).toBe(REPLY);
    confirmButton().click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(remove).toHaveBeenCalledWith(REPLY);
    expect(remove).not.toHaveBeenCalledWith(ROOT);
    expect(remove).not.toHaveBeenCalledWith(THREAD);
    expect(text()).toContain('Mensaje raíz');
    expect(text()).not.toContain('Respuesta del profesor');
    expect(harness.routeNativeElement?.querySelector('app-conversation-view')).not.toBeNull();
    expect(TestBed.inject(ForumModerationState).deletedThreadIds().has(THREAD)).toBe(false);
  });

  it('DOM real con autor repetido: Eliminar de R envía R y avisa del hilo', async () => {
    list.mockResolvedValueOnce([
      post({ id: ROOT, parentId: null, body: 'Mensaje raíz',
        authorDisplayName: 'Profesor', authorIsAdmin: true }),
      post({ id: REPLY, parentId: ROOT, body: 'Respuesta del profesor',
        authorDisplayName: 'Profesor', authorIsAdmin: true, createdAt: '2026-11-18T10:01:00Z' }),
    ]);
    remove.mockResolvedValueOnce({ threadDeleted: true });
    await asAdmin();
    view().reload();
    await harness.fixture.whenStable();
    harness.detectChanges();

    deleteButtonById(ROOT).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const panel = harness.routeNativeElement!.querySelector<HTMLElement>('.delete-confirm')!;
    expect(panel.closest('[data-comment-id]')?.getAttribute('data-comment-id')).toBe(ROOT);
    expect(panel.textContent).toContain('Se borrará el hilo completo');
    confirmButton().click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(remove).toHaveBeenCalledWith(ROOT);
    expect(remove).not.toHaveBeenCalledWith(REPLY);
    expect(text()).toContain('Hilo eliminado');
    expect(TestBed.inject(ForumModerationState).deletedThreadIds().has(THREAD)).toBe(true);
  });
});
