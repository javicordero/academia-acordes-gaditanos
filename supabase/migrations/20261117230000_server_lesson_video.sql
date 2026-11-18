-- Puente exclusivo del servidor: private no está expuesto por PostgREST.
-- p_user_id debe proceder de Auth.getUser(jwt), nunca del cuerpo HTTP.
--
-- Devuelve los metadatos del vídeo de una lección para la Edge Function
-- firmante. No emite tokens ni URLs firmadas y no contiene claves.
--
-- `l.is_published` y `c.status = 'published'` se filtran aquí, no en la RLS:
-- un admin (o service_role) ve borradores en `public.lessons`, pero esta RPC
-- no debe emitirlos. El GUID solo se devuelve si tiene forma de UUID y el
-- estado es 'ready'; si no, `video` es null (nunca se propaga un identificador
-- basura). El derecho se evalúa con `p_user_id`, no con el rol de sesión.
create function public.server_lesson_video(p_user_id uuid, p_lesson_id uuid)
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
    and l.is_published
    and c.status = 'published'
    and (
      l.is_free_preview
      or exists (
        select 1 from public.user_roles u
        where u.user_id = p_user_id
          and u.role = 'admin'
      )
      or exists (
        select 1 from public.entitlements e
        where e.user_id = p_user_id
          and e.course_id = l.course_id
          and e.revoked_at is null
      )
    );
$$;

revoke all on function public.server_lesson_video(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_lesson_video(uuid, uuid) to service_role;
