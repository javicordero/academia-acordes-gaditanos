import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { ForumModerationState } from './forum-moderation-state';
import { ForumThread } from './forum-thread';
import { ForumThreads } from './forum-threads';
import { ForumThreadRepository } from './forum-thread-repository';

const CATEGORY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NEW_THREAD = '33333333-3333-3333-3333-333333333333';
const POST = '11111111-1111-1111-1111-111111111111';

function thread(overrides: Record<string, unknown> = {}) {
  return {
    id: THREAD, categoryId: CATEGORY, title: 'Duda de rasgueo', createdAt: '2026-11-18T10:00:00Z',
    authorDisplayName: 'Alumno', authorIsAdmin: false, replyCount: 2, ...overrides,
  };
}

function createdThread() {
  return {
    id: NEW_THREAD, categoryId: CATEGORY, title: 'Tema nuevo', body: 'Cuerpo nuevo',
    createdAt: '2026-11-18T10:00:00Z', authorDisplayName: 'Alumno', authorIsAdmin: false,
  };
}

describe('Pantalla de hilos del foro', () => {
  const listThreads = vi.fn();
  const createThread = vi.fn();
  const deleteComment = vi.fn();
  const list = vi.fn();
  const isAdmin = signal(false);
  let harness: RouterTestingHarness;
  let text: () => string;

  beforeEach(async () => {
    vi.clearAllMocks();
    isAdmin.set(false);
    listThreads.mockResolvedValue([thread({ authorIsAdmin: true })]);
    createThread.mockResolvedValue(createdThread());
    deleteComment.mockResolvedValue({ threadDeleted: true });
    list.mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'comunidad', children: [
          { path: ':categoryId', component: ForumThreads },
          { path: ':categoryId/:threadId', component: ForumThread },
        ] }]),
        { provide: ForumThreadRepository,
          useValue: { listThreads, createThread, deleteComment, list, create: vi.fn() } },
        { provide: AuthService, useValue: { isAdmin } },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/comunidad/' + CATEGORY, ForumThreads);
    await harness.fixture.whenStable();
    harness.detectChanges();
    text = () => harness.routeNativeElement?.textContent ?? '';
  });

  function screen(): ForumThreads {
    return harness.routeDebugElement?.componentInstance as ForumThreads;
  }

  function buttonWith(label: string): HTMLButtonElement {
    return [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === label)!;
  }

  function submitValid(): void {
    screen().title.set('  Tema nuevo  ');
    screen().body.set('  Cuerpo nuevo  ');
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLFormElement>('form.forum-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('lista título, autor, fecha, respuestas y badge de administrador, con un solo h1', () => {
    expect(harness.routeNativeElement?.querySelectorAll('h1')).toHaveLength(1);
    expect(text()).toContain('Duda de rasgueo');
    expect(text()).toContain('Alumno');
    expect(text()).toContain('2 respuestas');
    expect(harness.routeNativeElement?.querySelector('time')?.getAttribute('datetime'))
      .toBe('2026-11-18T10:00:00Z');
    expect(harness.routeNativeElement?.querySelector<HTMLAnchorElement>(`a[href="/comunidad/${CATEGORY}/${THREAD}"]`))
      .not.toBeNull();
  });

  it('badge admin con texto y forma accesible', () => {
    const badge = harness.routeNativeElement?.querySelector<HTMLElement>('.forum-badge')!;
    expect(badge.textContent).toContain('Administrador');
    expect(badge.getAttribute('aria-label')).toBe('Distintivo de administrador');
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('el esqueleto de hilos es decorativo y anuncia la carga una sola vez', async () => {
    let resolve!: (rows: unknown[]) => void;
    listThreads.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    screen().load();
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('list');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando hilos');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('article.page')?.getAttribute('aria-busy')).toBe('true');
    resolve([]);
  });

  it('muestra carga, vacío y error reintentable', async () => {
    let resolve!: (rows: unknown[]) => void;
    listThreads.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    screen().load();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="status"]')?.textContent).toContain('Cargando hilos');
    resolve([]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).toContain('Todavía no hay hilos en esta categoría.');

    listThreads.mockRejectedValueOnce(new Error('https://ejemplo.test?token=secreto'));
    screen().load();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    expect(text()).not.toContain('secreto');
    buttonWith('Reintentar').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).toContain('Duda de rasgueo');
  });

  it('valida título y cuerpo con foco, sin publicar automáticamente', async () => {
    expect(createThread).not.toHaveBeenCalled();
    expect(buttonWith('Publicar tema').disabled).toBe(true);

    screen().title.set('x'.repeat(121));
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLFormElement>('form.forum-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(createThread).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.querySelector('.field-error')?.textContent).toContain('120 caracteres');
    expect(document.activeElement?.id).toBe(screen().titleInputId);
    expect(harness.routeNativeElement?.querySelector(`#${screen().titleInputId}`)?.getAttribute('aria-invalid')).toBe('true');

    screen().title.set('Tema nuevo');
    screen().body.set('y'.repeat(2001));
    harness.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLFormElement>('form.forum-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(createThread).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe(screen().bodyInputId);
  });

  it('publica solo al enviar y navega al tema nuevo sin recargar', async () => {
    submitValid();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(createThread).toHaveBeenCalledWith(CATEGORY, 'Tema nuevo', 'Cuerpo nuevo');
    expect(TestBed.inject(Router).url).toBe(`/comunidad/${CATEGORY}/${NEW_THREAD}`);
    expect(harness.routeNativeElement?.textContent).toContain('Hilo del foro');
  });

  it('muestra el error de publicación sin filtrar el mensaje crudo', async () => {
    createThread.mockRejectedValueOnce(new Error('token=secreto&email=alumno@ejemplo.test'));
    submitValid();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('No se pudo');
    expect(text()).not.toContain('secreto');
    expect(text()).not.toContain('@');
    expect(TestBed.inject(Router).url).toBe(`/comunidad/${CATEGORY}`);
  });

  it('quita un hilo borrado en la sesión sin volver a cargar la lista', async () => {
    expect(listThreads).toHaveBeenCalledTimes(1);
    TestBed.inject(ForumModerationState).markThreadDeleted(THREAD);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).not.toContain('Duda de rasgueo');
    expect(text()).toContain('Todavía no hay hilos en esta categoría.');
    expect(listThreads).toHaveBeenCalledTimes(1);
  });

  it('tras borrar la raíz el hilo no reaparece al volver a la categoría', async () => {
    list.mockResolvedValueOnce([{
      id: POST, parentId: null, body: 'Mensaje raíz', createdAt: '2026-11-18T10:00:00Z',
      authorDisplayName: 'Alumno', authorIsAdmin: false,
    }]);
    isAdmin.set(true);
    await harness.navigateByUrl(`/comunidad/${CATEGORY}/${THREAD}`, ForumThread);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const threadEl = harness.routeNativeElement!;
    const deleteButton = [...threadEl.querySelectorAll<HTMLButtonElement>('.delete-button')]
      .find((b) => b.getAttribute('aria-label') === 'Eliminar comentario de Alumno')!;
    deleteButton.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Confirmar eliminación')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(deleteComment).toHaveBeenCalledWith(POST);
    expect(text()).toContain('Hilo eliminado');

    await harness.navigateByUrl(`/comunidad/${CATEGORY}`, ForumThreads);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).not.toContain('Duda de rasgueo');
    expect(text()).toContain('Todavía no hay hilos en esta categoría.');
  });
});
