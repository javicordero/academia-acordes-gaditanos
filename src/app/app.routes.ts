import { Routes } from '@angular/router';

import { adminGuard } from './core/auth/admin.guard';
import { authGuard } from './core/auth/auth.guard';

const home = () => import('./features/home/home').then((m) => m.Home);

const notFound = () =>
  import('./features/not-found/not-found').then((m) => m.NotFound);

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Academia de Guitarra',
    loadComponent: home,
  },
  {
    path: 'cursos',
    loadChildren: () =>
      import('./features/cursos/cursos.routes').then((m) => m.cursosRoutes),
  },
  {
    path: 'aula',
    loadChildren: () =>
      import('./features/aula/aula.routes').then((m) => m.AULA_ROUTES),
  },
  {
    path: 'mis-cursos',
    title: 'Mis cursos · Academia de Guitarra',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/mis-cursos/mis-cursos').then((m) => m.MisCursos),
  },
  {
    path: 'perfil',
    title: 'Mi perfil · Academia de Guitarra',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/perfil/perfil').then((m) => m.Perfil),
  },
  {
    path: 'comunidad',
    title: 'Comunidad · Academia de Guitarra',
    loadChildren: () =>
      import('./features/foro/foro.routes').then((m) => m.FORO_ROUTES),
  },
  {
    path: 'legal',
    loadChildren: () =>
      import('./features/legal/legal.routes').then((m) => m.LEGAL_ROUTES),
  },
  {
    path: 'auth/login',
    title: 'Iniciar sesión · Academia de Guitarra',
    loadComponent: () =>
      import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'auth/registro',
    title: 'Crear cuenta · Academia de Guitarra',
    loadComponent: () =>
      import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'auth/recuperar',
    title: 'Recuperar contraseña · Academia de Guitarra',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then(
        (m) => m.ForgotPassword,
      ),
  },
  {
    path: 'auth/callback',
    title: 'Confirmar enlace · Academia de Guitarra',
    loadComponent: () =>
      import('./features/auth/callback/callback').then((m) => m.AuthCallback),
  },
  {
    path: 'auth/actualizar-contrasena',
    title: 'Nueva contraseña · Academia de Guitarra',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/update-password/update-password').then(
        (m) => m.UpdatePassword,
      ),
  },
  {
    path: 'auth/cuenta-confirmada',
    title: 'Correo confirmado · Academia de Guitarra',
    loadComponent: () =>
      import('./features/auth/account-confirmed/account-confirmed').then(
        (m) => m.AccountConfirmed,
      ),
  },
  {
    path: 'sin-acceso',
    title: 'Sin acceso · Academia de Guitarra',
    loadComponent: () =>
      import('./features/auth/forbidden/forbidden').then((m) => m.Forbidden),
  },
  {
    path: 'admin',
    title: 'Administración · Academia de Guitarra',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
    children: [
      { path: '', pathMatch: 'full', data: { section: 'cursos' }, children: [] },
      { path: 'nuevo', data: { section: 'nuevo' }, children: [] },
      {
        path: 'curso/:courseId',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'datos' },
          { path: 'datos', data: { section: 'datos' }, children: [] },
          { path: 'estructura', data: { section: 'estructura' }, children: [] },
          { path: 'leccion/:lessonId', data: { section: 'leccion' }, children: [] },
          {
            path: 'vista-previa/:lessonId',
            data: { section: 'vista-previa' },
            loadComponent: () => import('./features/admin/preview/preview').then((m) => m.Preview),
          },
          {
            path: 'vista-previa',
            data: { section: 'vista-previa' },
            loadComponent: () => import('./features/admin/preview/preview').then((m) => m.Preview),
          },
          { path: 'estado', data: { section: 'estado' }, children: [] },
        ],
      },
      // Enlaces profundos históricos: se mantienen y permanecen dentro del workspace.
      {
        path: 'vista-previa/:courseId/:lessonId',
        data: { section: 'vista-previa' },
        loadComponent: () => import('./features/admin/preview/preview').then((m) => m.Preview),
      },
      {
        path: 'vista-previa/:courseId',
        data: { section: 'vista-previa' },
        loadComponent: () => import('./features/admin/preview/preview').then((m) => m.Preview),
      },
      { path: ':courseId/:lessonId/video', data: { section: 'leccion' }, children: [] },
    ],
  },
  {
    path: 'not-found',
    title: 'Página no encontrada · Academia de Guitarra',
    loadComponent: notFound,
  },
  {
    path: '**',
    title: 'Página no encontrada · Academia de Guitarra',
    loadComponent: notFound,
  },
];
