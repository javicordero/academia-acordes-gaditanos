-- Normalización del nombre visible en las RPC de conversación.
--
-- Corrección aditiva: NO edita migraciones históricas, tablas, RLS, índices,
-- longitudes de body, validación de padres, entitlements ni server_lesson_video.
-- Añade public.safe_display_name(uuid) y reemplaza SOLO el cuerpo de las seis
-- RPC que devolvían el nombre mediante coalesce(...), conservando firmas,
-- columnas de salida, security definer, search_path = '', auth.uid(), orden y
-- grants (solo authenticated recibe EXECUTE; anon y service_role, no).
--
-- El nombre visible se calcula en SERVIDOR: un admin real según
-- public.user_roles se muestra exactamente como 'Administrador' con
-- author_is_admin = true; cualquier otro usuario cuyo display_name contenga
-- '@' o sea equivalente a admin/administrador (insensible a mayúsculas y
-- espacios) se muestra como 'Alumno'. Nunca se lee auth.users.email.
-- Sin datos personales, secretos ni precios. No se ha aplicado a remoto;
-- PGlite valida solo lógica SQL/RLS.

-- Auxiliar de proyección: security invoker, estable y con search_path vacío.
-- Solo service_role recibe EXECUTE; las RPC security definer la invocan con el
-- rol propietario de estas, sin ampliar privilegios de anon/authenticated.
create function public.safe_display_name(p_user uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  with candidate as (
    select left(nullif(btrim(p.display_name), ''), 60) as name
    from public.profiles p
    where p.id = p_user
  )
  select case
    when exists (
      select 1 from public.user_roles ur
      where ur.user_id = p_user and ur.role = 'admin'
    ) then 'Administrador'
    when c.name is null then 'Alumno'
    when position('@' in c.name) > 0 then 'Alumno'
    when lower(regexp_replace(c.name, '\s+', '', 'g')) in ('admin', 'administrador') then 'Alumno'
    else c.name
  end
  from (select (select name from candidate) as name) c;
$$;

revoke all on function public.safe_display_name(uuid) from public, anon, authenticated;
grant execute on function public.safe_display_name(uuid) to service_role;

-- Comentarios por lección: listado. Mismo access control y orden.
create or replace function public.list_lesson_comments(p_lesson_id uuid)
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
    public.safe_display_name(lc.author_id) as author_display_name,
    exists (
      select 1 from public.user_roles ur2
      where ur2.user_id = lc.author_id and ur2.role = 'admin'
    ) as author_is_admin
  from public.lesson_comments lc
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

-- Comentarios por lección: creación anidada. Mismo id generado antes de
-- validar, mismo padre de la MISMA lección, mismo btrim 1..2000 y mismos
-- derechos; solo cambia la proyección del nombre visible.
create or replace function public.create_lesson_comment(
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
  v_id uuid := gen_random_uuid();
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

  if p_parent_id = v_id or (
    p_parent_id is not null
    and not exists (
      select 1 from public.lesson_comments pc
      where pc.id = p_parent_id
        and pc.lesson_id = p_lesson_id
    )
  ) then
    raise exception 'Respuesta no válida' using errcode = '23503';
  end if;

  insert into public.lesson_comments as lc (id, lesson_id, author_id, parent_id, body)
  values (v_id, p_lesson_id, v_user_id, p_parent_id, v_body)
  returning lc.id into v_id;

  return query
    select
      c.id,
      c.parent_id,
      c.body,
      c.created_at,
      public.safe_display_name(c.author_id),
      exists (
        select 1 from public.user_roles ur2
        where ur2.user_id = c.author_id and ur2.role = 'admin'
      )
    from public.lesson_comments c
    where c.id = v_id;
end;
$$;

-- Foro: hilos. Mismo reply_count, orden y sesión requerida.
create or replace function public.list_forum_threads(p_category_id uuid)
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
    public.safe_display_name(ft.author_id) as author_display_name,
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = ft.author_id and ur.role = 'admin'
    ) as author_is_admin,
    greatest(
      (select count(*) from public.forum_posts fp where fp.thread_id = ft.id) - 1,
      0
    )::int as reply_count
  from public.forum_threads ft
  where ft.category_id = p_category_id
    and (select auth.uid()) is not null
  order by ft.created_at desc, ft.id desc;
$$;

-- Foro: crear hilo y post raíz. Mismas validaciones de título y cuerpo, misma
-- transacción y mismas columnas de salida.
create or replace function public.create_forum_thread(
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
      public.safe_display_name(ft.author_id),
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = ft.author_id and ur.role = 'admin'
      )
    from public.forum_threads ft
    join public.forum_posts fp on fp.thread_id = ft.id and fp.parent_id is null
    where ft.id = v_thread_id;
end;
$$;

-- Foro: mensajes de un hilo. Misma forma y orden que list_lesson_comments.
create or replace function public.list_thread_posts(p_thread_id uuid)
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
    public.safe_display_name(fp.author_id) as author_display_name,
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = fp.author_id and ur.role = 'admin'
    ) as author_is_admin
  from public.forum_posts fp
  where fp.thread_id = p_thread_id
    and (select auth.uid()) is not null
  order by fp.created_at asc, fp.id asc;
$$;

-- Foro: responder. Mismo id anticipado, mismo padre del MISMO hilo y mismo
-- btrim 1..2000; solo cambia la proyección del nombre visible.
create or replace function public.create_thread_post(
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
      public.safe_display_name(fp.author_id),
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = fp.author_id and ur.role = 'admin'
      )
    from public.forum_posts fp
    where fp.id = v_id;
end;
$$;

-- Grants intactos: se repiten para hacer explícito que CREATE OR REPLACE no
-- amplía privilegios. La auxiliar NO se concede a anon/authenticated.
revoke all on function public.list_lesson_comments(uuid) from public, anon, authenticated;
grant execute on function public.list_lesson_comments(uuid) to authenticated;

revoke all on function public.create_lesson_comment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_lesson_comment(uuid, text, uuid) to authenticated;

revoke all on function public.list_forum_threads(uuid) from public, anon, authenticated;
grant execute on function public.list_forum_threads(uuid) to authenticated;

revoke all on function public.create_forum_thread(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_forum_thread(uuid, text, text) to authenticated;

revoke all on function public.list_thread_posts(uuid) from public, anon, authenticated;
grant execute on function public.list_thread_posts(uuid) to authenticated;

revoke all on function public.create_thread_post(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_thread_post(uuid, text, uuid) to authenticated;
