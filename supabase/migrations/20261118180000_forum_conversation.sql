-- Foro general: backend de conversación con tablas nuevas y una sola capa de RPC.
--
-- Alcance cerrado: categorías, hilos y mensajes con respuestas anidadas, más
-- cinco RPC para listar y crear. No sustituye ni edita el backend mínimo de
-- comentarios por lección (20261118160000 y 20261118170000, ya aplicados en DEV):
-- son tablas nuevas para no regresar ese contrato. La futura UI compartirá una
-- única capa de conversación; aquí no hay interfaz Angular.
--
-- La autorización se comprueba en base de datos con auth.uid() leído en
-- SERVIDOR, nunca con parámetros del cliente ni con claims de rol. El foro es
-- general: cualquier `authenticated` con sesión lee y escribe; no se exige
-- entitlement ni se asocia a curso. El badge de admin sale de public.user_roles
-- y el nombre visible de public.profiles.display_name, sin correos.
--
-- Las tres tablas tienen RLS activo SIN políticas y sin grants para anon ni
-- authenticated; service_role conserva todos. Las RPC son security definer con
-- set search_path = '' y totalmente cualificadas; solo `authenticated` recibe
-- EXECUTE. anon queda denegado por GRANT. Sin sesión o con referencia inexistente
-- las RPC devuelven 0 filas, sin revelar el motivo.
--
-- Tres categorías genéricas sembradas de forma idempotente por slug: general,
-- dudas y presentaciones. Sin datos personales, precios ni secretos.
-- No hay edición, borrado, moderación, notificaciones, realtime ni contadores
-- persistentes. No se ha aplicado a ningún proyecto Supabase remoto; PGlite
-- valida solo lógica SQL/RLS.

create table public.forum_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.forum_categories (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid null references public.forum_posts (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

comment on table public.forum_categories is
  'Categorías genéricas del foro. Acceso solo mediante RPC; RLS activo sin políticas y sin grants de cliente.';
comment on table public.forum_threads is
  'Hilos del foro general. Acceso solo mediante RPC; RLS activo sin políticas y sin grants de cliente.';
comment on table public.forum_posts is
  'Mensajes y respuestas anidadas del foro general. Acceso solo mediante RPC; RLS activo sin políticas y sin grants de cliente.';
comment on column public.forum_posts.parent_id is
  'Respuesta anidada del MISMO hilo: sin límite de profundidad en BD; el sangrado visual se acota en UI.';

create index forum_threads_category_created_idx
  on public.forum_threads (category_id, created_at desc, id desc);
create index forum_posts_thread_created_idx
  on public.forum_posts (thread_id, created_at asc, id asc);
create index forum_posts_parent_id_idx
  on public.forum_posts (parent_id);

alter table public.forum_categories enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;

revoke all on public.forum_categories from public, anon, authenticated;
revoke all on public.forum_threads from public, anon, authenticated;
revoke all on public.forum_posts from public, anon, authenticated;
grant all on public.forum_categories to service_role;
grant all on public.forum_threads to service_role;
grant all on public.forum_posts to service_role;

-- Semilla idempotente: repetir la migración no duplica categorías por slug.
insert into public.forum_categories (slug, title, description, position)
select v.slug, v.title, v.description, v.position
from (values
  ('general', 'General', 'Temas generales de la academia.', 0),
  ('dudas', 'Dudas', 'Dudas sobre técnica y contenidos.', 1),
  ('presentaciones', 'Presentaciones', 'Presentaciones de la comunidad.', 2)
) as v(slug, title, description, position)
where not exists (
  select 1 from public.forum_categories fc where fc.slug = v.slug
);

-- Categorías. Sin datos de autor; la sesión se exige en servidor.
create function public.list_forum_categories()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  "position" int
)
language sql stable security definer
set search_path = ''
as $$
  select fc.id, fc.slug, fc.title, fc.description, fc."position"
  from public.forum_categories fc
  where (select auth.uid()) is not null
  order by fc."position" asc, fc.id asc;
$$;

-- Hilos de una categoría. reply_count = posts del hilo - 1 (post raíz), nunca
-- negativo. El badge y el nombre se calculan en BD por autor del hilo.
create function public.list_forum_threads(p_category_id uuid)
returns table (
  id uuid,
  category_id uuid,
  title text,
  created_at timestamptz,
  author_display_name text,
  author_is_admin boolean,
  reply_count int
)
language sql stable security definer
set search_path = ''
as $$
  select
    ft.id,
    ft.category_id,
    ft.title,
    ft.created_at,
    coalesce(
      nullif(btrim(pr.display_name), ''),
      case when exists (
        select 1 from public.user_roles ur
        where ur.user_id = ft.author_id and ur.role = 'admin'
      ) then 'Administrador' else 'Alumno' end
    ) as author_display_name,
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = ft.author_id and ur.role = 'admin'
    ) as author_is_admin,
    greatest(
      (select count(*) from public.forum_posts fp where fp.thread_id = ft.id) - 1,
      0
    )::int as reply_count
  from public.forum_threads ft
  left join public.profiles pr on pr.id = ft.author_id
  where ft.category_id = p_category_id
    and (select auth.uid()) is not null
  order by ft.created_at desc, ft.id desc;
$$;

-- Crear hilo y su post raíz en la misma transacción. Sin sesión o con categoría
-- inexistente devuelve 0 filas; el resto de invalidaciones son errores de CHECK.
-- El cuerpo y el título se recortan con btrim antes de insertar.
create function public.create_forum_thread(
  p_category_id uuid,
  p_title text,
  p_body text
)
returns table (
  id uuid,
  category_id uuid,
  title text,
  body text,
  created_at timestamptz,
  author_display_name text,
  author_is_admin boolean
)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_title text := btrim(p_title);
  v_body text := btrim(p_body);
  v_thread_id uuid := gen_random_uuid();
begin
  if v_user_id is null
     or not exists (
       select 1 from public.forum_categories fc where fc.id = p_category_id
     ) then
    return;
  end if;

  if v_title is null or char_length(v_title) not between 1 and 120
     or v_body is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'Tema de foro no válido' using errcode = '23514';
  end if;

  insert into public.forum_threads as ft (id, category_id, author_id, title)
  values (v_thread_id, p_category_id, v_user_id, v_title);

  insert into public.forum_posts as fp (thread_id, author_id, parent_id, body)
  values (v_thread_id, v_user_id, null, v_body);

  return query
    select
      ft.id,
      ft.category_id,
      ft.title,
      fp.body,
      fp.created_at,
      coalesce(
        nullif(btrim(pr.display_name), ''),
        case when exists (
          select 1 from public.user_roles ur
          where ur.user_id = ft.author_id and ur.role = 'admin'
        ) then 'Administrador' else 'Alumno' end
      ),
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = ft.author_id and ur.role = 'admin'
      )
    from public.forum_threads ft
    join public.forum_posts fp on fp.thread_id = ft.id and fp.parent_id is null
    left join public.profiles pr on pr.id = ft.author_id
    where ft.id = v_thread_id;
end;
$$;

-- Mensajes de un hilo, con la misma forma que list_lesson_comments.
create function public.list_thread_posts(p_thread_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  author_display_name text,
  author_is_admin boolean
)
language sql stable security definer
set search_path = ''
as $$
  select
    fp.id,
    fp.parent_id,
    fp.body,
    fp.created_at,
    coalesce(
      nullif(btrim(pr.display_name), ''),
      case when exists (
        select 1 from public.user_roles ur
        where ur.user_id = fp.author_id and ur.role = 'admin'
      ) then 'Administrador' else 'Alumno' end
    ) as author_display_name,
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = fp.author_id and ur.role = 'admin'
    ) as author_is_admin
  from public.forum_posts fp
  left join public.profiles pr on pr.id = fp.author_id
  where fp.thread_id = p_thread_id
    and (select auth.uid()) is not null
  order by fp.created_at asc, fp.id asc;
$$;

-- Responder en un hilo. El id se genera antes de validar para impedir
-- autorreferencia: un padre inexistente (incluido el que se acaba de generar)
-- se rechaza. El padre, si se indica, debe existir en el MISMO hilo; anidado
-- sin límite de profundidad en BD. Sin sesión o hilo inexistente: 0 filas.
create function public.create_thread_post(
  p_thread_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  author_display_name text,
  author_is_admin boolean
)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_body text := btrim(p_body);
  v_id uuid := gen_random_uuid();
begin
  if v_user_id is null
     or not exists (
       select 1 from public.forum_threads ft where ft.id = p_thread_id
     ) then
    return;
  end if;

  if v_body is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'Mensaje de foro no válido' using errcode = '23514';
  end if;

  if p_parent_id = v_id or (
    p_parent_id is not null
    and not exists (
      select 1 from public.forum_posts fp
      where fp.id = p_parent_id and fp.thread_id = p_thread_id
    )
  ) then
    raise exception 'Respuesta no válida' using errcode = '23503';
  end if;

  insert into public.forum_posts as fp (id, thread_id, author_id, parent_id, body)
  values (v_id, p_thread_id, v_user_id, p_parent_id, v_body)
  returning fp.id into v_id;

  return query
    select
      fp.id,
      fp.parent_id,
      fp.body,
      fp.created_at,
      coalesce(
        nullif(btrim(pr.display_name), ''),
        case when exists (
          select 1 from public.user_roles ur
          where ur.user_id = fp.author_id and ur.role = 'admin'
        ) then 'Administrador' else 'Alumno' end
      ),
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = fp.author_id and ur.role = 'admin'
      )
    from public.forum_posts fp
    left join public.profiles pr on pr.id = fp.author_id
    where fp.id = v_id;
end;
$$;

revoke all on function public.list_forum_categories() from public, anon, authenticated;
grant execute on function public.list_forum_categories() to authenticated;

revoke all on function public.list_forum_threads(uuid) from public, anon, authenticated;
grant execute on function public.list_forum_threads(uuid) to authenticated;

revoke all on function public.create_forum_thread(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_forum_thread(uuid, text, text) to authenticated;

revoke all on function public.list_thread_posts(uuid) from public, anon, authenticated;
grant execute on function public.list_thread_posts(uuid) to authenticated;

revoke all on function public.create_thread_post(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_thread_post(uuid, text, uuid) to authenticated;
