import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { LessonCommentsError } from './lesson-comment';
import { LessonCommentsRepository } from './lesson-comments-repository';
import { LessonComments } from './lesson-comments';
import { ConversationView } from './conversation-view';

const LESSON = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPLY = '22222222-2222-2222-2222-222222222222';

describe('Wrapper de comentarios de lección', () => {
  const list = vi.fn();
  const create = vi.fn();
  const remove = vi.fn();
  const isAdmin = signal(false);
  let fixture: ComponentFixture<LessonComments>;
  let root: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    isAdmin.set(false);
    list.mockResolvedValue([]);
    create.mockResolvedValue({ id: REPLY });
    remove.mockResolvedValue({ threadDeleted: false });
    TestBed.configureTestingModule({
      providers: [
        { provide: LessonCommentsRepository, useValue: { list, create, deleteComment: remove } },
        { provide: AuthService, useValue: { isAdmin } },
      ],
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

  function view(): ConversationView {
    return fixture.debugElement.query(By.directive(ConversationView)).componentInstance as ConversationView;
  }

  it('usa la vista compartida con la lección como ámbito y sus textos por defecto', async () => {
    await settle();
    expect(root.querySelector('app-conversation-view')).not.toBeNull();
    expect(view().scopeId()).toBe(LESSON);
    expect(view().heading()).toBe('Comentarios de la lección');
    expect(view().emptyText()).toBe('Todavía no hay comentarios en esta lección.');
    expect(view().submitText()).toBe('Publicar comentario');
    expect(root.querySelectorAll('h2')).toHaveLength(1);
    expect(list).toHaveBeenCalledWith(LESSON);
  });

  it('adapta el repositorio histórico sin cambiar su contrato ni el padre por omisión', async () => {
    await settle();
    await view().repository().list(LESSON);
    expect(list).toHaveBeenCalledWith(LESSON);

    await view().repository().create(LESSON, '  Hola  ');
    expect(create).toHaveBeenLastCalledWith(LESSON, '  Hola  ', null);

    await view().repository().create(LESSON, 'Respuesta', REPLY);
    expect(create).toHaveBeenLastCalledWith(LESSON, 'Respuesta', REPLY);
  });

  it('oculta la conversación cuando el repositorio de lección niega el acceso', async () => {
    list.mockRejectedValueOnce(new LessonCommentsError('forbidden'));
    await settle();
    expect(root.querySelector('section')).toBeNull();
    expect(root.textContent).not.toContain('Comentarios de la lección');
    expect(root.textContent).not.toContain('acceso');
  });

  it('pasa canModerate desde AuthService a la vista compartida', async () => {
    await settle();
    expect(view().canModerate()).toBe(false);
    expect(view().rootDeletesThread()).toBe(false);

    isAdmin.set(true);
    await settle();
    expect(view().canModerate()).toBe(true);
  });

  it('adapta deleteComment al repositorio histórico de lección', async () => {
    await settle();
    await view().repository().deleteComment(REPLY);
    expect(remove).toHaveBeenCalledWith(REPLY);
  });
});
