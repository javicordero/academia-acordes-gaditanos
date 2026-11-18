-- Comentarios reales por lección: backend mínimo, sin foro completo.
--
-- Alcance cerrado: dos RPC para listar y crear comentarios por lección, con un
-- solo nivel de respuestas. La autorización se comprueba en base de datos con
-- auth.uid() leído en SERVIDOR, nunca con parámetros del cliente ni con claims
-- de rol. No hay edición, borrado, moderación, notificaciones, tiempo real ni
-- contadores. No se publican cursos ni lecciones y no se concede acceso a anon.
--
-- La tabla tiene RLS activo SIN políticas: denegación por defecto. No se dan
-- grants a anon/authenticated sobre la tabla; solo las dos RPC son invocables
-- por authenticated, y ambas comprueban el derecho antes de tocar datos.
-- `author_is_admin` se calcula en BD desde public.user_roles, nunca desde un
-- claim. El nombre visible sale de public.profiles.display_name (sin correo).
--
-- No contiene datos reales, precios, claves ni secretos. No se ha aplicado a
-- ningún proyecto Supabase remoto. PGlite valida solo lógica SQL/RLS.

create table public.lesson_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid null references public.lesson_comments (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

comment on table public.lesson_comments is
  'Comentarios por lección. Acceso solo mediante las RPC; RLS activo sin políticas y sin grants de cliente.';
comment on column public.lesson_comments.parent_id is
  'Respuesta de primer nivel: si no es nulo, apunta a un comentario sin padre de la MISMA lección.';

create index lesson_comments_lesson_id_created_at_idx
  on public.lesson_comments (lesson_id, created_at);
create index lesson_comments_parent_id_idx
  on public.lesson_comments (parent_id);

alter table public.lesson_comments enable row level security;

revoke all on public.lesson_comments from public, anon, authenticated;
grant all on public.lesson_comments to service_role;

-- Listado. security definer para poder leer la tabla con RLS sin políticas;
-- el derecho se evalúa explícitamente con auth.uid(). Si no hay acceso, el
-- WHERE no devuelve filas: no se revela si la lección existe ni por qué se
-- deniega. anon queda fuera por GRANT, no por una política.
create function public.list_lesson_comments(p_lesson_id uuid)
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
    lc.id,
    lc.parent_id,
    lc.body,
    lc.created_at,
    coalesce(
      nullif(btrim(p.display_name), ''),
      case when exists (
        select 1 from public.user_roles ur2
        where ur2.user_id = lc.author_id and ur2.role = 'admin'
      ) then 'Administrador' else 'Alumno' end
    ) as author_display_name,
    exists (
      select 1 from public.user_roles ur2
      where ur2.user_id = lc.author_id and ur2.role = 'admin'
    ) as author_is_admin
  from public.lesson_comments lc
  left join public.profiles p on p.id = lc.author_id
  where lc.lesson_id = p_lesson_id
    and (select auth.uid()) is not null
    and (
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = (select auth.uid()) and ur.role = 'admin'
      )
      or exists (
        select 1
        from public.lessons l
        join public.courses c on c.id = l.course_id
        where l.id = p_lesson_id
          and l.is_published
          and c.status = 'published'
          and (
            l.is_free_preview
            or exists (
              select 1 from public.entitlements e
              where e.user_id = (select auth.uid())
                and e.course_id = l.course_id
                and e.revoked_at is null
            )
          )
      )
    )
  order by lc.created_at asc, lc.id asc;
$$;

-- Creación. Sin acceso devuelve 0 filas, sin mensaje que distinga motivo.
-- El cuerpo se recorta con btrim; la longitud 1..2000 la garantiza el CHECK y
-- se valida antes de insertar para no depender solo del error de constraint.
-- p_parent_id, si existe, debe ser raíz de la MISMA lección: máximo 1 nivel.
create function public.create_lesson_comment(
  p_lesson_id uuid,
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
  v_allowed boolean;
  v_id uuid;
begin
  v_allowed := v_user_id is not null and (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_user_id and ur.role = 'admin'
    )
    or exists (
      select 1
      from public.lessons l
      join public.courses c on c.id = l.course_id
      where l.id = p_lesson_id
        and l.is_published
        and c.status = 'published'
        and (
          l.is_free_preview
          or exists (
            select 1 from public.entitlements e
            where e.user_id = v_user_id
              and e.course_id = l.course_id
              and e.revoked_at is null
          )
        )
    )
  );

  if not v_allowed then
    return;
  end if;

  if v_body is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'Comentario no válido' using errcode = '23514';
  end if;

  if p_parent_id is not null then
    if not exists (
      select 1 from public.lesson_comments pc
      where pc.id = p_parent_id
        and pc.lesson_id = p_lesson_id
        and pc.parent_id is null
    ) then
      raise exception 'Respuesta no válida' using errcode = '23503';
    end if;
  end if;

  insert into public.lesson_comments as lc (lesson_id, author_id, parent_id, body)
  values (p_lesson_id, v_user_id, p_parent_id, v_body)
  returning lc.id into v_id;

  return query
    select
      c.id,
      c.parent_id,
      c.body,
      c.created_at,
      coalesce(
        nullif(btrim(pr.display_name), ''),
        case when exists (
          select 1 from public.user_roles ur2
          where ur2.user_id = c.author_id and ur2.role = 'admin'
        ) then 'Administrador' else 'Alumno' end
      ),
      exists (
        select 1 from public.user_roles ur2
        where ur2.user_id = c.author_id and ur2.role = 'admin'
      )
    from public.lesson_comments c
    left join public.profiles pr on pr.id = c.author_id
    where c.id = v_id;
end;
$$;

revoke all on function public.list_lesson_comments(uuid) from public, anon, authenticated;
grant execute on function public.list_lesson_comments(uuid) to authenticated;

revoke all on function public.create_lesson_comment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_lesson_comment(uuid, text, uuid) to authenticated;
