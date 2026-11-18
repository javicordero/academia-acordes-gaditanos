import { describe, expect, it } from 'vitest';
import {
  ConversationError,
  MAX_CONVERSATION_LENGTH,
  isConversationUuid,
  parseConversationRow,
  shouldHideConversation,
} from './conversation';
import { buildConversationTree } from './conversation-view';
import { LessonCommentsError } from './lesson-comment';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

function row(id: string, parentId: string | null): {
  id: string; parentId: string | null; body: string; createdAt: string;
  authorDisplayName: string; authorIsAdmin: boolean;
} {
  return {
    id, parentId, body: 'Mensaje', createdAt: '2026-11-18T10:00:00Z',
    authorDisplayName: 'Alumno', authorIsAdmin: false,
  };
}

describe('Puerto compartido de conversación', () => {
  it('mantiene huérfanos y corta ciclos sin perder las raíces', () => {
    const tree = buildConversationTree([
      row(A, B), row(B, A), row(C, '44444444-4444-4444-4444-444444444444'),
    ]);
    expect(tree.map((node) => node.post.id)).toEqual([C, A]);
    expect(tree[1].children.map((node) => node.post.id)).toEqual([B]);
    expect(tree[1].children[0].children).toHaveLength(0);
    expect(tree[0].children).toHaveLength(0);
  });

  it('valida filas estrictamente y traduce errores sin filtrar mensajes', () => {
    const parsed = parseConversationRow({
      id: A, parent_id: null, body: 'Hola', created_at: '2026-11-18T10:00:00Z',
      author_display_name: 'Profesor', author_is_admin: true, extra: 'campo-ignorado',
    });
    expect(parsed.body).toBe('Hola');
    expect(() => parseConversationRow({ id: A, parent_id: 7 })).toThrow(ConversationError);
    expect(() => parseConversationRow({ id: 'no-uuid', parent_id: null, body: 'Hola',
      created_at: '2026-11-18T10:00:00Z', author_display_name: 'A', author_is_admin: false }))
      .toThrow(ConversationError);
    expect(() => parseConversationRow({ id: A, parent_id: null, body: 'x'.repeat(MAX_CONVERSATION_LENGTH + 1),
      created_at: '2026-11-18T10:00:00Z', author_display_name: 'A', author_is_admin: false }))
      .toThrow(ConversationError);
    expect(isConversationUuid(A)).toBe(true);
    expect(isConversationUuid('no-uuid')).toBe(false);
    expect(shouldHideConversation(new ConversationError('forbidden'))).toBe(true);
    expect(shouldHideConversation(new LessonCommentsError('unconfigured'))).toBe(true);
    expect(shouldHideConversation(new ConversationError('invalid'))).toBe(false);
    expect(shouldHideConversation({ message: 'permission denied' })).toBe(false);
  });
});
