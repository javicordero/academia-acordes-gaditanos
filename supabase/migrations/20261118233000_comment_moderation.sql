-- Moderación mínima: borrado REAL de comentarios y mensajes del foro.
--
-- Alcance cerrado: dos RPC nuevas. NO edita las migraciones ya aplicadas de
-- comentarios (160000/170000) ni de foro (180000), NO toca tablas, RLS, índices,
-- grants de tabla ni las RPC existentes. Es aditivo.
--
-- La autorización se comprueba en SERVIDOR con auth.uid() leído del JWT y con
-- un rol admin REAL en public.user_roles; no hay parámetro de actor. Quien no
-- es admin recibe exactamente la misma respuesta que un id inexistente: no se
-- revela si el comentario o el post existen. Solo authenticated recibe EXECUTE;
-- PUBLIC, anon y service_role, no. Las tablas siguen con RLS sin políticas y
-- sin grants de cliente: las RPC son la única vía.
--
-- Borrado en cascada: los hijos de un comentario y de un post se eliminan por
-- los FK parent_id ... on delete cascade ya existentes; borrar un post raíz
-- elimina el hilo completo por el FK thread_id ... on delete cascade. No se
-- borran categorías, roles, derechos, pedidos ni progreso. No hay flags de
-- moderación, notificaciones ni edición: este bloque solo borra de verdad.
--
-- Sin datos personales, correos, IDs de Bunny ni secretos. No se ha aplicado a
-- ningún proyecto remoto; PGlite valida solo lógica SQL/RLS.

-- Comentario de lección: true solo si se borró una fila como admin.
create function public.delete_lesson_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_user_id and ur.role = 'admin'
  ) then
    return false;
  end if;

  delete from public.lesson_comments where id = p_comment_id;
  if found then
    return true;
  end if;
  return false;
end;
$$;

comment on function public.delete_lesson_comment(uuid) is
  'Borra un comentario de lección y sus respuestas en cascada; solo admin real. Sin sesión, no admin o id inexistente: false.';

-- Post del foro: una respuesta se borra sola (con sus descendientes); una raíz
-- borra el hilo entero. Misma respuesta negativa para no admin y para id
-- inexistente, sin distinguir motivos.
create function public.delete_forum_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_thread_id uuid;
  v_parent_id uuid;
  v_deleted_posts bigint;
  v_denied jsonb := jsonb_build_object(
    'deleted', false, 'thread_deleted', false, 'deleted_posts', 0
  );
begin
  if v_user_id is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_user_id and ur.role = 'admin'
  ) then
    return v_denied;
  end if;

  select fp.thread_id, fp.parent_id into v_thread_id, v_parent_id
  from public.forum_posts fp
  where fp.id = p_post_id;

  if not found then
    return v_denied;
  end if;

  if v_parent_id is not null then
    with recursive descendientes(id) as (
      select fp.id from public.forum_posts fp where fp.id = p_post_id
      union all
      select child.id from public.forum_posts child
        join descendientes d on child.parent_id = d.id
    )
    select count(*) into v_deleted_posts from descendientes;

    delete from public.forum_posts where id = p_post_id;
    return jsonb_build_object(
      'deleted', true, 'thread_deleted', false, 'deleted_posts', v_deleted_posts
    );
  end if;

  select count(*) into v_deleted_posts
  from public.forum_posts fp
  where fp.thread_id = v_thread_id;

  delete from public.forum_threads where id = v_thread_id;
  return jsonb_build_object(
    'deleted', true, 'thread_deleted', true, 'deleted_posts', v_deleted_posts
  );
end;
$$;

comment on function public.delete_forum_post(uuid) is
  'Borra una respuesta del foro con sus descendientes, o el hilo completo si es la raíz; solo admin real. Sin sesión, no admin o id inexistente: deleted=false.';

-- Grants: solo authenticated puede invocarlas. Las tablas conservan sus
-- grants: anon/authenticated sin privilegios, service_role intacto.
revoke all on function public.delete_lesson_comment(uuid) from public, anon, authenticated;
grant execute on function public.delete_lesson_comment(uuid) to authenticated;

revoke all on function public.delete_forum_post(uuid) from public, anon, authenticated;
grant execute on function public.delete_forum_post(uuid) to authenticated;
