-- Puente exclusivo del servidor: private no está expuesto por PostgREST.
-- p_user_id debe proceder de Auth.getUser(jwt), nunca del cuerpo HTTP.
--
-- Sustituye la regla de 20261117230000_server_lesson_video.sql: esa versión
-- base exigía lección y curso publicados incluso al admin; esta es la definitiva
-- (se aplica después, en orden de nombre) y añade la vista previa de admin.
--
-- Devuelve los metadatos del vídeo de una lección para la Edge Function
-- firmante. No emite tokens ni URLs firmadas y no contiene claves.
--
-- Un admin real (comprobado en public.user_roles, no en claims) puede
-- previsualizar borradores: no se exigen l.is_published ni
-- c.status='published', pero la lección y su curso deben existir (el join
-- sigue). Esto NO concede nada a alumnos ni a anon: para ellos se mantienen
-- l.is_published, c.status='published' y (muestra gratuita o derecho activo).
-- `preview` sigue siendo el dato l.is_free_preview, no el permiso.
-- El GUID solo se devuelve si tiene forma de UUID y el estado es 'ready';
-- si no, `video` es null (nunca se propaga un identificador basura).
-- El derecho se evalúa con `p_user_id`, no con el rol de sesión.
create or replace function public.server_lesson_video(p_user_id uuid, p_lesson_id uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'course_id', l.course_id,
    'preview', l.is_free_preview,
    'video', case
      when v.lesson_id is not null
        and v.provider = 'bunny'
        and v.status = 'ready'
        and v.provider_video_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and coalesce(v.provider_library_id, '812678') ~ '^[0-9]{1,12}$'
      then jsonb_build_object(
        'provider', 'bunny',
        'library_id', coalesce(v.provider_library_id, '812678'),
        'video_id', lower(v.provider_video_id),
        'duration_seconds', case
          when v.duration_seconds is not null and v.duration_seconds >= 0
            then to_jsonb(v.duration_seconds)
          else 'null'::jsonb
        end
      )
      else 'null'::jsonb
    end
  )
  from public.lessons l
  join public.courses c on c.id = l.course_id
  left join private.lesson_videos v
    on v.lesson_id = l.id
  where l.id = p_lesson_id
    and (
      -- is_admin: admin real en public.user_roles; con p_user_id nulo es falso.
      exists (
        select 1 from public.user_roles u
        where u.user_id = p_user_id
          and u.role = 'admin'
      )
      or (
        l.is_published
        and c.status = 'published'
        and (
          l.is_free_preview
          or exists (
            select 1 from public.entitlements e
            where e.user_id = p_user_id
              and e.course_id = l.course_id
              and e.revoked_at is null
          )
        )
      )
    );
$$;

revoke all on function public.server_lesson_video(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_lesson_video(uuid, uuid) to service_role;
