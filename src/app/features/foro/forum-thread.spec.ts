import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationError } from '../comentarios/conversation';
import { ConversationView } from '../comentarios/conversation-view';
import { ForumThread } from './forum-thread';
import { ForumThreadRepository } from './forum-thread-repository';

const CATEGORY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ROOT = '11111111-1111-1111-1111-111111111111';
const REPLY = '22222222-2222-2222-2222-222222222222';
const NEW = '33333333-3333-3333-3333-333333333333';

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOT, parentId: null, body: 'Duda del tema', createdAt: '2026-11-18T10:00:00Z',
    authorDisplayName: 'Profesor', authorIsAdmin: true, ...overrides,
  };
}

describe('Pantalla de un hilo del foro', () => {
  const list = vi.fn();
  const create = vi.fn();
  let harness: RouterTestingHarness;
  let text: () => string;

  beforeEach(async () => {
    vi.clearAllMocks();
    list.mockResolvedValue([post()]);
    create.mockResolvedValue(post({ id: NEW, parentId: ROOT, body: 'Gracias', authorIsAdmin: false }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'comunidad/:categoryId/:threadId', component: ForumThread }]),
        { provide: ForumThreadRepository, useValue: { list, create } },
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
});
