-- Favoritos por lección: backend mínimo, sin interfaz Angular, notificaciones
-- ni hilos. El actor se resuelve en servidor con auth.uid(); no hay parámetro
-- de usuario ni confianza en claims de rol.
--
-- La tabla tiene RLS activo SIN políticas: denegación por defecto. No se dan
-- grants a anon ni authenticated; service_role conserva los suyos. Solo las
-- dos RPC son invocables por authenticated, y ambas comprueban el MISMO acceso
-- que el catálogo: admin real en public.user_roles o lección publicada de
-- curso publicado con muestra gratuita o derecho activo (revoked_at is null).
-- Se reutilizan private.is_admin() y private.has_course_entitlement(), que ya
-- son security definer con search_path vacío y leading cualificado.
--
-- Sin acceso, el listado devuelve 0 filas y el toggle lanza 42501 con un
-- mensaje genérico: no se revela si la lección existe ni el motivo. No se
-- exponen correos, roles completos ni identificadores de otros usuarios. Las
-- RPC no crean derechos, pedidos, progreso ni roles.
--
-- No contiene datos reales, precios, claves ni secretos. No se ha aplicado a
-- ningún proyecto Supabase remoto. PGlite valida solo lógica SQL/RLS.

create table public.lesson_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

comment on table public.lesson_favorites is
  'Favoritos por lección. Acceso solo mediante las RPC; RLS activo sin políticas y sin grants de cliente.';

-- Apoya el acceso por usuario y fecha; la clave primaria ya cubre (user_id).
create index lesson_favorites_user_id_created_at_idx
  on public.lesson_favorites (user_id, created_at desc);

alter table public.lesson_favorites enable row level security;

revoke all on public.lesson_favorites from public, anon, authenticated;
grant all on public.lesson_favorites to service_role;

-- Listado del propio usuario, con metadatos del catálogo ya legibles. SQL
-- stable security definer para poder leer la tabla con RLS sin políticas; el
-- derecho se evalúa explícitamente con auth.uid() leído en servidor.
create function public.list_my_lesson_favorites()
returns table (
  lesson_id uuid,
  lesson_slug text,
  lesson_title text,
  course_id uuid,
  course_slug text,
  course_title text,
  section_id uuid,
  section_title text,
  "position" int,
  created_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select
    l.id as lesson_id,
    l.slug as lesson_slug,
    l.title as lesson_title,
    c.id as course_id,
    c.slug as course_slug,
    c.title as course_title,
    cs.id as section_id,
    cs.title as section_title,
    l.position as position,
    lf.created_at as created_at
  from public.lesson_favorites lf
  join public.lessons l on l.id = lf.lesson_id
  join public.courses c on c.id = l.course_id
  join public.course_sections cs on cs.id = l.section_id
  where lf.user_id = (select auth.uid())
    and (select auth.uid()) is not null
    and (
      private.is_admin()
      or (
        l.is_published
        and c.status = 'published'
        and (
          l.is_free_preview
          or private.has_course_entitlement(l.course_id)
        )
      )
    )
  order by c.title asc, l.position asc, l.id asc;
$$;

-- Alternancia: existencia y acceso se comprueban ANTES de escribir. Con id
-- inexistente, incluso un admin recibe el mismo 42501 genérico que sin derecho
-- (no distingue motivos ni revela existencia por un error de FK distinto).
-- Si ya existe el favorito se borra y devuelve false; si no, se inserta y
-- devuelve true. La fila queda ligada al actor resuelto por auth.uid().
create function public.toggle_lesson_favorite(p_lesson_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_allowed boolean;
begin
  if v_user_id is null then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.lessons l
    join public.courses c on c.id = l.course_id
    where l.id = p_lesson_id
      and (
        private.is_admin()
        or (
          l.is_published
          and c.status = 'published'
          and (
            l.is_free_preview
            or private.has_course_entitlement(l.course_id)
          )
        )
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Acceso denegado' using errcode = '42501';
  end if;

  delete from public.lesson_favorites lf
  where lf.user_id = v_user_id and lf.lesson_id = p_lesson_id;

  if found then
    return false;
  end if;

  insert into public.lesson_favorites (user_id, lesson_id)
  values (v_user_id, p_lesson_id);

  return true;
end;
$$;

revoke all on function public.list_my_lesson_favorites() from public, anon, authenticated, service_role;
grant execute on function public.list_my_lesson_favorites() to authenticated;

revoke all on function public.toggle_lesson_favorite(uuid) from public, anon, authenticated, service_role;
grant execute on function public.toggle_lesson_favorite(uuid) to authenticated;
