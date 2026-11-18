-- Sustituye solo la proyección del vídeo de public.server_lesson_video.
-- Aditivo: no edita 20261117230000 ni 20261117270000; se aplica después.
--
-- La library ID sale exclusivamente de private.lesson_videos (fila privada,
-- alimentada por el servidor). No hay fallback hardcodeado: si la fila no trae
-- una library numérica válida (null, vacío o basura), `video` es null y el GUID
-- privado no se propaga. El firmante sigue exigiendo su propia configuración de
-- biblioteca antes de emitir nada.
--
-- La autorización y la vista previa de admin son exactamente las de la versión
-- anterior (20261117270000): no se relaja ninguna regla de derecho.
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
        and v.provider_library_id ~ '^[0-9]{1,12}$'
      then jsonb_build_object(
        'provider', 'bunny',
        'library_id', v.provider_library_id,
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
