-- Escritura exclusiva del servidor: la API pública no expone private.
-- p_user_id debe proceder de Auth.getUser(jwt); el rol se comprueba en
-- public.user_roles, nunca en claims ni en user_metadata.
--
-- La RPC recibe el library ID del entorno de la Edge Function, el GUID ya
-- verificado contra Bunny y el estado normalizado; no confía en el cliente.
-- Un mismo GUID no puede quedar asociado a dos lecciones.

-- Bunny distingue 'processing' de 'pending'. La CHECK inicial no lo admitía.
alter table private.lesson_videos
  drop constraint if exists lesson_videos_status_check;
alter table private.lesson_videos
  add constraint lesson_videos_status_check
  check (status in ('pending', 'processing', 'ready', 'disabled'));

create or replace function public.server_link_lesson_video(
  p_user_id uuid,
  p_lesson_id uuid,
  p_provider_library_id text,
  p_video_id uuid,
  p_duration_seconds integer,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean;
begin
  if p_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.lessons l
    join public.courses c on c.id = l.course_id
    where l.id = p_lesson_id
  ) then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;

  if p_provider_library_id is null or p_provider_library_id !~ '^[0-9]{1,12}$' then
    raise exception using message = 'invalid_library', errcode = '22023';
  end if;
  if p_video_id is null or p_video_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using message = 'invalid_video', errcode = '22023';
  end if;
  if p_status not in ('pending', 'processing', 'ready') then
    raise exception using message = 'invalid_status', errcode = '22023';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception using message = 'invalid_duration', errcode = '22023';
  end if;

  -- La restricción UNIQUE(provider, provider_video_id) protege también ante
  -- carreras: el mensaje 'conflict' se traduce a HTTP 409 en la Edge Function.
  if exists (
    select 1 from private.lesson_videos
    where provider = 'bunny'
      and provider_video_id = p_video_id::text
      and lesson_id <> p_lesson_id
  ) then
    raise exception using message = 'conflict', errcode = 'P0001';
  end if;

  insert into private.lesson_videos
    (lesson_id, provider, provider_video_id, provider_library_id, duration_seconds, status)
  values
    (p_lesson_id, 'bunny', p_video_id::text, p_provider_library_id, p_duration_seconds, p_status)
  on conflict (lesson_id) do update set
    provider = excluded.provider,
    provider_video_id = excluded.provider_video_id,
    provider_library_id = excluded.provider_library_id,
    duration_seconds = excluded.duration_seconds,
    status = excluded.status,
    updated_at = now()
  returning (xmax = 0) into v_inserted;

  -- El contrato público solo distingue 'ready' de 'processing'.
  return jsonb_build_object(
    'linkage', case when v_inserted then 'linked' else 'linked_yet' end,
    'status', case when p_status = 'ready' then 'ready' else 'processing' end
  );
end;
$$;

revoke all on function public.server_link_lesson_video(uuid, uuid, text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.server_link_lesson_video(uuid, uuid, text, uuid, integer, text)
  to service_role;
