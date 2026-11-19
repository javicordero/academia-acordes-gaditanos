import { Routes } from '@angular/router';

const legalPage = () => import('./legal').then((m) => m.Legal);

/** Rutas locales de las páginas legales, montadas bajo `/legal`. */
export const LEGAL_ROUTES: Routes = [
  {
    path: 'aviso-legal',
    title: 'Aviso legal · Academia de Guitarra',
    data: { page: 'aviso-legal' },
    loadComponent: legalPage,
  },
  {
    path: 'privacidad',
    title: 'Privacidad · Academia de Guitarra',
    data: { page: 'privacidad' },
    loadComponent: legalPage,
  },
  {
    path: 'cookies',
    title: 'Cookies · Academia de Guitarra',
    data: { page: 'cookies' },
    loadComponent: legalPage,
  },
  {
    path: 'terminos',
    title: 'Términos de compra · Academia de Guitarra',
    data: { page: 'terminos' },
    loadComponent: legalPage,
  },
  {
    path: 'reembolsos',
    title: 'Reembolsos · Academia de Guitarra',
    data: { page: 'reembolsos' },
    loadComponent: legalPage,
  },
  { path: '', pathMatch: 'full', redirectTo: 'aviso-legal' },
];
