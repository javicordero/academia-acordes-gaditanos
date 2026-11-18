-- Ampliación aditiva de comentarios por lección: hilos anidados sin límite de
-- profundidad en BD (decisión técnica: ida y vuelta admin ↔ alumno).
--
-- Sustituye SOLO el cuerpo de public.create_lesson_comment mediante
-- CREATE OR REPLACE: misma firma, mismas columnas de salida, security definer,
-- search_path = '' y mismos grants (solo authenticated recibe EXECUTE).
-- No toca list_lesson_comments (ya devuelve parent_id), la tabla, sus índices,
-- RLS ni los grants. No edita la migración 20261118160000, ya aplicada en DEV.
--
-- Novedad: si p_parent_id no es nulo, debe existir, pertenecer a la MISMA
-- lección y no ser el comentario que se está insertando. Ya NO se exige que el
-- padre sea raíz, así que se puede responder a una respuesta. No hay límite de
-- profundidad en BD; el sangrado visual acotado es decisión de UI (no implementada
-- aquí). Se mantienen auth.uid() leído en servidor, admin real en user_roles o
-- muestra/derecho activo, btrim de 1..2000, y ausencia de edición, borrado,
-- moderación, notificaciones, realtime y contadores.
--
-- No contiene datos personales, secretos ni precios. No se ha aplicado a ningún
-- proyecto Supabase remoto; PGlite valida solo lógica SQL/RLS.

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

  -- El id se genera antes de validar para impedir autorreferencia. El padre
  -- puede ser raíz o responder a otra respuesta de la misma lección.
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

comment on column public.lesson_comments.parent_id is
  'Respuesta anidada de la MISMA lección: si no es nulo, apunta a otro comentario existente de esa lección (sin límite de profundidad en BD; el sangrado visual se acota en UI).';

-- Grants intactos: se repiten las sentencias originales para hacer explícito
-- que CREATE OR REPLACE no amplía privilegios.
revoke all on function public.create_lesson_comment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_lesson_comment(uuid, text, uuid) to authenticated;
