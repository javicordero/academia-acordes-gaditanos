alter table private.lesson_resources
  add column upload_owner uuid references auth.users(id) on delete set null,
  add column upload_size integer check (upload_size between 1 and 10485760),
  add column upload_identity text;

-- Las reservas anteriores sin propietario no pueden finalizarse automáticamente.
create or replace function public.server_prepare_lesson_pdf(
  p_user_id uuid, p_lesson_id uuid, p_resource_id uuid, p_title text,
  p_file_name text, p_file_size integer, p_mime_type text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_course_id uuid;
begin
  if not exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') then return null; end if;
  if p_resource_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 160
     or p_title ~ '[[:cntrl:]]' or p_file_name is null or length(p_file_name) > 255
     or p_file_name !~* '^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$'
     or p_file_size is null or p_file_size not between 1 and 10485760
     or p_mime_type is distinct from 'application/pdf' then raise exception 'Invalid upload'; end if;
  select course_id into v_course_id from public.lessons where id = p_lesson_id for update;
  if not found then return null; end if;
  insert into private.lesson_resources (id, lesson_id, kind, title, storage_bucket, storage_path, is_downloadable, position, upload_owner)
  values (p_resource_id, p_lesson_id, 'pdf', btrim(p_title), 'lesson-pdfs',
    v_course_id::text || '/' || p_lesson_id::text || '/' || p_resource_id::text || '/file.pdf', false,
    (select coalesce(max(position) + 1, 0) from private.lesson_resources where lesson_id = p_lesson_id), p_user_id);
  return jsonb_build_object('course_id', v_course_id);
end $$;
revoke all on function public.server_prepare_lesson_pdf(uuid,uuid,uuid,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.server_prepare_lesson_pdf(uuid,uuid,uuid,text,text,integer,text) to service_role;

create function public.server_lesson_pdf_reservation(p_user_id uuid, p_lesson_id uuid, p_resource_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('course_id', l.course_id, 'bucket', r.storage_bucket, 'path', r.storage_path)
  from private.lesson_resources r join public.lessons l on l.id = r.lesson_id
  where r.id = p_resource_id and l.id = p_lesson_id and r.upload_owner = p_user_id
    and r.kind = 'pdf' and r.storage_bucket = 'lesson-pdfs'
    and r.storage_path = l.course_id::text || '/' || l.id::text || '/' || r.id::text || '/file.pdf'
    and exists (select 1 from public.user_roles u where u.user_id = p_user_id and u.role = 'admin');
$$;

create function public.server_finalize_lesson_pdf(p_user_id uuid, p_lesson_id uuid, p_resource_id uuid, p_size integer, p_identity text)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare r private.lesson_resources%rowtype;
begin
  -- El bloqueo serializa la revocación del rol con la publicación.
  perform 1 from public.user_roles where user_id = p_user_id and role = 'admin' for share;
  if not found or p_size is null or p_size not between 1 and 10485760
     or p_identity is null or length(p_identity) not between 1 and 512 then return false; end if;
  select lr.* into r from private.lesson_resources lr join public.lessons l on l.id = lr.lesson_id
  where lr.id = p_resource_id and lr.lesson_id = p_lesson_id and lr.upload_owner = p_user_id
    and lr.kind = 'pdf' and lr.storage_bucket = 'lesson-pdfs'
    and lr.storage_path = l.course_id::text || '/' || l.id::text || '/' || lr.id::text || '/file.pdf'
  for update of lr;
  if not found then return false; end if;
  if r.is_downloadable then
    return r.upload_size is not distinct from p_size and r.upload_identity is not distinct from p_identity;
  end if;
  update private.lesson_resources set is_downloadable = true, upload_size = p_size, upload_identity = p_identity where id = r.id;
  return true;
end $$;
revoke all on function public.server_lesson_pdf_reservation(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.server_finalize_lesson_pdf(uuid,uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.server_lesson_pdf_reservation(uuid,uuid,uuid) to service_role;
grant execute on function public.server_finalize_lesson_pdf(uuid,uuid,uuid,integer,text) to service_role;
