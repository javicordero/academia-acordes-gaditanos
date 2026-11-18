import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForumThread } from './forum-thread';
import { ForumThreads } from './forum-threads';
import { ForumThreadRepository } from './forum-thread-repository';

const CATEGORY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NEW_THREAD = '33333333-3333-3333-3333-333333333333';

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
  const list = vi.fn();
  let harness: RouterTestingHarness;
  let text: () => string;

  beforeEach(async () => {
    vi.clearAllMocks();
    listThreads.mockResolvedValue([thread({ authorIsAdmin: true })]);
    createThread.mockResolvedValue(createdThread());
    list.mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'comunidad', children: [
          { path: ':categoryId', component: ForumThreads },
          { path: ':categoryId/:threadId', component: ForumThread },
        ] }]),
        { provide: ForumThreadRepository, useValue: { listThreads, createThread, list, create: vi.fn() } },
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
});
