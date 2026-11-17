-- Modelo editorial provisional: el tipo no exige ni expone recursos privados.
-- El valor por defecto conserva el comportamiento de las lecciones existentes.
alter table public.lessons
  add column content_type text not null default 'video'
    check (content_type in ('video', 'pdf', 'text'));
