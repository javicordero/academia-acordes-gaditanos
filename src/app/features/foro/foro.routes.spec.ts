import { describe, expect, it } from 'vitest';
import { FORO_ROUTES } from './foro.routes';

describe('Rutas exportadas del foro', () => {
  it('exporta tres rutas lazy standalone bajo /foro sin tocar el enrutado raíz', async () => {
    expect(FORO_ROUTES.map((route) => route.path)).toEqual(['', ':categoryId', ':categoryId/:threadId']);
    const components = await Promise.all(
      FORO_ROUTES.map((route) => route.loadComponent!()),
    );
    expect(components.map((component) => (component as { name: string }).name.replace(/^_/, ''))).toEqual([
      'ForumCategories', 'ForumThreads', 'ForumThread',
    ]);
  });
});
