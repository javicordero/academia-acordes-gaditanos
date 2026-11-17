import { Routes } from '@angular/router';

export const AULA_ROUTES: Routes = [{
  path: ':courseSlug/:lessonSlug',
  loadComponent: () => import('./aula/aula').then(m => m.Aula),
}];
