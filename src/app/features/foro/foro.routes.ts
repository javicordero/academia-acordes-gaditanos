import { Routes } from '@angular/router';

/**
 * Rutas del foro, listas para integrar como hijas de `/foro`.
 * El coordinador las introduce en `app.routes.ts` con `loadChildren`;
 * este archivo no modifica el enrutado raíz.
 */
export const FORO_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Foro · Academia de Guitarra',
    loadComponent: () => import('./forum-categories').then((m) => m.ForumCategories),
  },
  {
    path: ':categoryId',
    title: 'Hilos del foro · Academia de Guitarra',
    loadComponent: () => import('./forum-threads').then((m) => m.ForumThreads),
  },
  {
    path: ':categoryId/:threadId',
    title: 'Hilo del foro · Academia de Guitarra',
    loadComponent: () => import('./forum-thread').then((m) => m.ForumThread),
  },
];
