import { Routes } from '@angular/router';

import { adminGuard } from './core/auth/admin.guard';
import { authGuard } from './core/auth/auth.guard';

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
    title: 'Mis cursos · Academia Acordes Gaditanos',
    canActivate: [authGuard],
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
    path: 'auth/login',
    title: 'Iniciar sesión · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'auth/registro',
    title: 'Crear cuenta · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'auth/recuperar',
    title: 'Recuperar contraseña · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then(
        (m) => m.ForgotPassword,
      ),
  },
  {
    path: 'auth/callback',
    title: 'Confirmar enlace · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/auth/callback/callback').then((m) => m.AuthCallback),
  },
  {
    path: 'auth/actualizar-contrasena',
    title: 'Nueva contraseña · Academia Acordes Gaditanos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/update-password/update-password').then(
        (m) => m.UpdatePassword,
      ),
  },
  {
    path: 'auth/cuenta-confirmada',
    title: 'Correo confirmado · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/auth/account-confirmed/account-confirmed').then(
        (m) => m.AccountConfirmed,
      ),
  },
  {
    path: 'sin-acceso',
    title: 'Sin acceso · Academia Acordes Gaditanos',
    loadComponent: () =>
      import('./features/auth/forbidden/forbidden').then((m) => m.Forbidden),
  },
  {
    path: 'admin/vista-previa/:courseId/:lessonId',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/preview/preview').then(m => m.Preview),
  },
  {
    path: 'admin/vista-previa/:courseId',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/preview/preview').then(m => m.Preview),
  },
  {
    path: 'admin',
    title: 'Administración · Academia Acordes Gaditanos',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
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
