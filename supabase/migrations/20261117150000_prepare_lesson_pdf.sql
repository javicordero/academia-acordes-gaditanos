-- Solo servidor: el usuario procede de Auth.getUser, nunca del cuerpo HTTP.
create function public.server_prepare_lesson_pdf(
  p_user_id uuid, p_lesson_id uuid, p_resource_id uuid, p_title text,
  p_file_name text, p_file_size integer, p_mime_type text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_course_id uuid;
  v_path text;
begin
  if not exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') then
    return null;
  end if;
  if p_resource_id is null or p_title is null or char_length(btrim(p_title)) not between 1 and 160
     or p_title ~ '[[:cntrl:]]' or p_file_name is null or length(p_file_name) > 255
     or p_file_name !~* '^[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$'
     or p_file_size is null or p_file_size not between 1 and 10485760
     or p_mime_type is distinct from 'application/pdf' then
    raise exception 'Invalid upload';
  end if;
  select course_id into v_course_id from public.lessons where id = p_lesson_id for update;
  if not found then return null; end if;
  v_path := v_course_id::text || '/' || p_lesson_id::text || '/' || p_resource_id::text || '/file.pdf';
  insert into private.lesson_resources (id, lesson_id, kind, title, storage_bucket, storage_path, is_downloadable, position)
  values (p_resource_id, p_lesson_id, 'pdf', btrim(p_title), 'lesson-pdfs', v_path, false,
    (select coalesce(max(position) + 1, 0) from private.lesson_resources where lesson_id = p_lesson_id));
  return jsonb_build_object('course_id', v_course_id);
end;
$$;
revoke all on function public.server_prepare_lesson_pdf(uuid, uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.server_prepare_lesson_pdf(uuid, uuid, uuid, text, text, integer, text) to service_role;
