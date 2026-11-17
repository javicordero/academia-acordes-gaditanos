import { Routes } from '@angular/router';

const notFound = () =>
  import('./features/not-found/not-found').then((m) => m.NotFound);

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'cursos',
  },
  {
    path: 'cursos',
    title: 'Cursos · Academia Acordes Gaditanos',
    loadComponent: () => import('./features/cursos/cursos').then((m) => m.Cursos),
  },
  {
    path: 'mis-cursos',
    title: 'Mis cursos · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/mis-cursos/mis-cursos').then((m) => m.MisCursos),
  },
  {
    path: 'comunidad',
    title: 'Comunidad · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/comunidad/comunidad').then((m) => m.Comunidad),
  },
  {
    path: 'not-found',
    title: 'Página no encontrada · Academia Acordes Gaditanos',
    loadComponent: notFound,
  },
  {
    path: '**',
    title: 'Página no encontrada · Academia Acordes Gaditanos',
    loadComponent: notFound,
  },
];
