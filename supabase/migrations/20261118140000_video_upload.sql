-- Subida editorial de vídeo con Bunny Stream (TUS resumable).
--
-- La firma TUS y la creación del objeto viven en la Edge Function; aquí solo se
-- guarda el trabajo privado y se enlaza el vídeo terminado. Ninguna columna de
-- `public.lessons` guarda GUID, library, ruta ni estado del proveedor.
--
-- Seguridad:
--   * `private.video_upload_jobs` con RLS y sin políticas: denegación por defecto.
--     Solo `service_role` tiene ACL sobre la tabla; anon/authenticated no.
--   * Todas las RPC son `security definer`, con `search_path = ''` y nombres
--     cualificados, y comprueban el rol en `public.user_roles` (nunca metadata).
--   * Las RPC se revocan a public/anon/authenticated: solo service_role.
--   * Los límites de tamaño y MIME son salvaguardas técnicas del servidor, no
--     una decisión comercial ni una promesa de protección absoluta.
--   * No se actualizan flags de publicación, contenido ni progreso del alumno.
--   * No hay borrado: un objeto ambiguo queda marcado para revisión humana.

create table private.video_upload_jobs (
  upload_id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  -- Identidad opaca de idempotencia: una petición, un trabajo, un objeto.
  request_id uuid not null unique,
  file_name text not null check (char_length(file_name) between 1 and 120),
  file_size bigint not null check (file_size > 0 and file_size <= 1073741824),
  mime_type text not null check (
    mime_type in ('video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska')
  ),
  provider text not null default 'bunny' check (provider = 'bunny'),
  provider_library_id text check (
    provider_library_id is null or provider_library_id ~ '^[0-9]{1,12}$'
  ),
  provider_video_id text check (
    provider_video_id is null
    or provider_video_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  state text not null default 'reserved' check (
    state in ('reserved', 'pending', 'uploading', 'processing', 'ready', 'failed', 'blocked')
  ),
  -- Se pone a true al reservar, ANTES de crear el objeto en Bunny: un replay
  -- nunca debe provocar un segundo POST de creación.
  create_attempted boolean not null default false,
  expires_at bigint check (expires_at is null or expires_at > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  provider_status integer check (provider_status is null or provider_status between 0 and 8),
  review_reason text check (
    review_reason is null
    or review_reason in ('create_ambiguous', 'attach_failed', 'provider_error')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index video_upload_jobs_one_active_per_lesson
  on private.video_upload_jobs (lesson_id)
  where state in ('reserved', 'pending', 'uploading', 'processing');
create unique index video_upload_jobs_provider_video_id
  on private.video_upload_jobs (provider_video_id)
  where provider_video_id is not null;
create index video_upload_jobs_lesson_id_idx
  on private.video_upload_jobs (lesson_id, created_at desc);

create trigger video_upload_jobs_set_updated_at
  before update on private.video_upload_jobs
  for each row execute function private.set_updated_at();

alter table private.video_upload_jobs enable row level security;
revoke all on private.video_upload_jobs from public, anon, authenticated;
grant all on private.video_upload_jobs to service_role;

-- Proyección interna del trabajo. Incluye el GUID solo para la Edge Function;
-- la respuesta pública de `status` nunca lo devuelve.
create function private.video_upload_job_json(p_job private.video_upload_jobs)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'uploadId', p_job.upload_id,
    'requestId', p_job.request_id,
    'lessonId', p_job.lesson_id,
    'fileName', p_job.file_name,
    'fileSize', p_job.file_size,
    'mimeType', p_job.mime_type,
    'state', p_job.state,
    'providerVideoId', p_job.provider_video_id,
    'providerLibraryId', p_job.provider_library_id,
    'expiresAt', p_job.expires_at,
    'durationSeconds', p_job.duration_seconds,
    'reviewRequired', p_job.review_reason is not null,
    'createAttempted', p_job.create_attempted
  );
$$;

revoke all on function private.video_upload_job_json(private.video_upload_jobs)
  from public, anon, authenticated;
grant execute on function private.video_upload_job_json(private.video_upload_jobs)
  to service_role;

-- ---------------------------------------------------------------------------
-- status: solo lectura. No crea, no firma y no devuelve identificadores del
-- proveedor. El contenido se consulta para cualquier borrador de administrador.
-- ---------------------------------------------------------------------------
create function public.video_upload_status(p_user_id uuid, p_lesson_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  select jsonb_build_object(
    'contentType', l.content_type,
    'hasVideo', v.lesson_id is not null,
    'durationSeconds', case
      when v.duration_seconds is not null and v.duration_seconds > 0
        then to_jsonb(v.duration_seconds)
      else null
    end,
    'job', case
      when j.upload_id is not null then private.video_upload_job_json(j)
      else 'null'::jsonb
    end
  )
  into v_result
  from public.lessons l
  left join private.lesson_videos v
    on v.lesson_id = l.id
    and v.status = 'ready'
    and v.provider_video_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  left join lateral (
    select j2.*
    from private.video_upload_jobs j2
    where j2.lesson_id = l.id
    order by case
               when j2.state in ('reserved', 'pending', 'uploading', 'processing') then 0
               else 1
             end,
             j2.created_at desc
    limit 1
  ) j on true
  where l.id = p_lesson_id;

  if v_result is null then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- reserve: reserva atómica ANTES del POST de creación en Bunny. Un mismo
-- request_id es idempotente; cualquier cambio de atributos o lección es 409.
-- ---------------------------------------------------------------------------
create function public.video_upload_reserve(
  p_user_id uuid,
  p_lesson_id uuid,
  p_request_id uuid,
  p_file_name text,
  p_file_size bigint,
  p_mime_type text,
  p_library_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.video_upload_jobs%rowtype;
  v_content_type text;
begin
  if p_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  select l.content_type into v_content_type
  from public.lessons l where l.id = p_lesson_id;
  if not found then
    raise exception using message = 'not_found', errcode = 'P0002';
  end if;
  if v_content_type <> 'video' then
    raise exception using message = 'invalid_lesson', errcode = 'P0001';
  end if;

  if p_request_id is null
    or p_file_name is null or char_length(btrim(p_file_name)) not between 1 and 120
    or p_file_name ~ '[/\\]'
    or p_file_size is null or p_file_size <= 0 or p_file_size > 1073741824
    or p_mime_type is null or p_mime_type not in (
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'
    )
    or p_library_id is null or p_library_id !~ '^[0-9]{1,12}$'
  then
    raise exception using message = 'invalid_request', errcode = '22023';
  end if;

  if exists (
    select 1 from private.lesson_videos v
    where v.lesson_id = p_lesson_id
      and v.status = 'ready'
      and v.provider_video_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using message = 'ready_exists', errcode = 'P0001';
  end if;

  select * into v_job
  from private.video_upload_jobs j where j.request_id = p_request_id;
  if found then
    if v_job.lesson_id <> p_lesson_id
      or v_job.file_name <> p_file_name
      or v_job.file_size <> p_file_size
      or v_job.mime_type <> p_mime_type
    then
      raise exception using message = 'request_mismatch', errcode = 'P0001';
    end if;
    return jsonb_build_object('created', false, 'job', private.video_upload_job_json(v_job));
  end if;

  if exists (
    select 1 from private.video_upload_jobs j
    where j.lesson_id = p_lesson_id
      and j.state in ('reserved', 'pending', 'uploading', 'processing')
  ) then
    raise exception using message = 'active_job', errcode = 'P0001';
  end if;

  insert into private.video_upload_jobs
    (lesson_id, request_id, file_name, file_size, mime_type, provider_library_id,
     create_attempted, state)
  values
    (p_lesson_id, p_request_id, p_file_name, p_file_size, p_mime_type, p_library_id,
     true, 'reserved')
  returning * into v_job;

  return jsonb_build_object('created', true, 'job', private.video_upload_job_json(v_job));
end;
$$;

-- ---------------------------------------------------------------------------
-- attach: liga el GUID devuelto por Bunny al trabajo reservado, solo por CAS.
-- Nunca sobrescribe un GUID ajeno ni un vídeo ya listo.
-- ---------------------------------------------------------------------------
create function public.video_upload_attach(
  p_user_id uuid,
  p_upload_id uuid,
  p_lesson_id uuid,
  p_request_id uuid,
  p_library_id text,
  p_video_id uuid,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.video_upload_jobs%rowtype;
begin
  if p_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  select * into v_job
  from private.video_upload_jobs j where j.upload_id = p_upload_id;
  if not found
    or v_job.lesson_id <> p_lesson_id
    or v_job.request_id <> p_request_id
  then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  if exists (
    select 1 from private.lesson_videos v
    where v.lesson_id = p_lesson_id
      and v.status = 'ready'
      and v.provider_video_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using message = 'ready_exists', errcode = 'P0001';
  end if;

  if v_job.provider_video_id is not null then
    if v_job.provider_video_id = p_video_id::text
      and v_job.state in ('reserved', 'pending', 'uploading', 'processing')
    then
      update private.video_upload_jobs j
      set expires_at = p_expires_at
      where j.upload_id = p_upload_id
        and j.provider_video_id = p_video_id::text
        and j.state in ('reserved', 'pending', 'uploading', 'processing')
      returning * into v_job;
      return jsonb_build_object('job', private.video_upload_job_json(v_job));
    end if;
    raise exception using message = 'conflict', errcode = 'P0001';
  end if;

  if exists (
    select 1 from private.video_upload_jobs j
    where j.provider_video_id = p_video_id::text
      and j.upload_id <> p_upload_id
  ) then
    raise exception using message = 'guid_in_use', errcode = 'P0001';
  end if;

  update private.video_upload_jobs j
  set provider_video_id = p_video_id::text,
      provider_library_id = p_library_id,
      expires_at = p_expires_at,
      state = 'pending',
      review_reason = null
  where j.upload_id = p_upload_id
    and j.provider_video_id is null
    and j.state = 'reserved'
    and j.create_attempted
  returning * into v_job;
  if not found then
    raise exception using message = 'conflict', errcode = 'P0001';
  end if;

  return jsonb_build_object('job', private.video_upload_job_json(v_job));
end;
$$;

-- ---------------------------------------------------------------------------
-- refresh: vuelve a firmar el MISMO GUID de un trabajo activo. No crea objeto
-- y no extiende la vida del recurso TUS en el proveedor.
-- ---------------------------------------------------------------------------
create function public.video_upload_refresh(
  p_user_id uuid,
  p_upload_id uuid,
  p_lesson_id uuid,
  p_expires_at bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.video_upload_jobs%rowtype;
begin
  if p_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  select * into v_job
  from private.video_upload_jobs j where j.upload_id = p_upload_id;
  if not found or v_job.lesson_id <> p_lesson_id then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if p_expires_at is null or p_expires_at <= 0 then
    raise exception using message = 'invalid_request', errcode = '22023';
  end if;
  if v_job.provider_video_id is null
    or v_job.state not in ('pending', 'uploading', 'processing')
  then
    raise exception using message = 'not_active', errcode = 'P0001';
  end if;

  update private.video_upload_jobs j
  set expires_at = p_expires_at,
      state = case when j.state = 'pending' then 'uploading' else j.state end
  where j.upload_id = p_upload_id
    and j.lesson_id = p_lesson_id
    and j.provider_video_id is not null
    and j.provider_video_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and j.state in ('pending', 'uploading', 'processing')
  returning * into v_job;
  if not found then
    raise exception using message = 'not_active', errcode = 'P0001';
  end if;

  return private.video_upload_job_json(v_job);
end;
$$;

-- ---------------------------------------------------------------------------
-- sync: aplica el estado oficial de Bunny (Finished = 4) con CAS sobre el GUID
-- del trabajo. Solo 'ready' con duración positiva enlaza el vídeo terminado, y
-- lo hace con INSERT ... ON CONFLICT DO NOTHING: nunca reemplaza otro enlace.
-- ---------------------------------------------------------------------------
create function public.video_upload_sync(
  p_user_id uuid,
  p_upload_id uuid,
  p_video_id uuid,
  p_provider_status integer,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.video_upload_jobs%rowtype;
  v_existing text;
  v_state text;
  v_duration integer := null;
begin
  if p_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;

  select * into v_job
  from private.video_upload_jobs j where j.upload_id = p_upload_id;
  if not found
    or v_job.provider_video_id is null
    or v_job.provider_video_id <> p_video_id::text
  then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if p_provider_status is null or p_provider_status not between 0 and 8 then
    raise exception using message = 'invalid_status', errcode = '22023';
  end if;

  if p_duration_seconds is not null and p_duration_seconds > 0 then
    v_duration := p_duration_seconds;
  end if;

  -- 0 Created; 1 Uploaded (100% de bytes NO es 'ready'); 2/3/7/8 en codificación;
  -- 4 Finished; 5/6 error del proveedor; cualquier otro valor queda en revisión.
  v_state := case
    when p_provider_status = 0 then 'pending'
    when p_provider_status in (1, 2, 3, 7, 8) then 'processing'
    when p_provider_status = 4 then case when v_duration is null then 'blocked' else 'ready' end
    when p_provider_status in (5, 6) then 'failed'
    else 'blocked'
  end;

  if v_state = 'ready' then
    select v.provider_video_id into v_existing
    from private.lesson_videos v where v.lesson_id = v_job.lesson_id;
    if v_existing is not null and v_existing <> p_video_id::text then
      v_state := 'blocked';
    elsif v_existing is null and exists (
      select 1 from private.lesson_videos v
      where v.provider_video_id = p_video_id::text
    ) then
      v_state := 'blocked';
    else
      insert into private.lesson_videos
        (lesson_id, provider, provider_video_id, provider_library_id, duration_seconds, status)
      values
        (v_job.lesson_id, 'bunny', p_video_id::text, v_job.provider_library_id, v_duration, 'ready')
      on conflict (lesson_id) do nothing;
      if not exists (
        select 1 from private.lesson_videos v
        where v.lesson_id = v_job.lesson_id
          and v.provider_video_id = p_video_id::text
          and v.status = 'ready'
      ) then
        v_state := 'blocked';
      end if;
    end if;
  end if;

  update private.video_upload_jobs j
  set state = v_state,
      duration_seconds = coalesce(v_duration, j.duration_seconds),
      provider_status = p_provider_status,
      review_reason = case when v_state = 'blocked' then 'provider_error' else null end
  where j.upload_id = p_upload_id
    and j.provider_video_id = p_video_id::text
    and j.state <> 'ready'
  returning * into v_job;

  if not found then
    -- Replay concurrente o trabajo ya listo: se devuelve el estado almacenado,
    -- sin reescribir nunca un vídeo terminado.
    select * into v_job
    from private.video_upload_jobs j where j.upload_id = p_upload_id;
  end if;

  return jsonb_build_object(
    'state', v_job.state,
    'durationSeconds', case
      when v_job.duration_seconds is not null and v_job.duration_seconds > 0
        then to_jsonb(v_job.duration_seconds)
      else null
    end,
    'job', private.video_upload_job_json(v_job)
  );
end;
$$;

-- Marca un trabajo para revisión humana sin borrar nada del proveedor.
create function public.video_upload_mark_review(
  p_user_id uuid,
  p_upload_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated boolean;
begin
  if p_user_id is null or not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'admin'
  ) then
    raise exception using message = 'forbidden', errcode = '42501';
  end if;
  if p_reason not in ('create_ambiguous', 'attach_failed', 'provider_error') then
    raise exception using message = 'invalid_request', errcode = '22023';
  end if;

  update private.video_upload_jobs j
  set state = 'blocked', review_reason = p_reason
  where j.upload_id = p_upload_id and j.state <> 'ready'
  returning true into v_updated;
  return coalesce(v_updated, false);
end;
$$;

revoke all on function public.video_upload_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.video_upload_reserve(uuid, uuid, uuid, text, bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.video_upload_attach(uuid, uuid, uuid, uuid, text, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.video_upload_refresh(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.video_upload_sync(uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.video_upload_mark_review(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.video_upload_status(uuid, uuid) to service_role;
grant execute on function public.video_upload_reserve(uuid, uuid, uuid, text, bigint, text, text)
  to service_role;
grant execute on function public.video_upload_attach(uuid, uuid, uuid, uuid, text, uuid, bigint)
  to service_role;
grant execute on function public.video_upload_refresh(uuid, uuid, uuid, bigint)
  to service_role;
grant execute on function public.video_upload_sync(uuid, uuid, uuid, integer, integer)
  to service_role;
grant execute on function public.video_upload_mark_review(uuid, uuid, text)
  to service_role;
