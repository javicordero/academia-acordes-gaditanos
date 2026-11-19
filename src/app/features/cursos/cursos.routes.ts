import { Routes } from '@angular/router';

// Integrar como hijo de /cursos o anteponer "cursos/" si se usa en rutas raíz.
export const cursosRoutes: Routes = [
  { path: '', pathMatch: 'full', title: 'Cursos · Academia de Guitarra',
    loadComponent: () => import('./cursos').then((m) => m.Cursos) },
  { path: ':slug', title: 'Curso · Academia de Guitarra',
    loadComponent: () => import('./course-detail/course-detail').then((m) => m.CourseDetail) },
];
