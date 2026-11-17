-- Puente exclusivo del servidor: private no está expuesto por PostgREST.
-- p_user_id debe proceder de Auth.getUser(jwt), nunca del cuerpo HTTP.
create function public.server_lesson_pdf_resources(p_user_id uuid, p_lesson_id uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object('course_id', l.course_id, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'kind', r.kind,
      'bucket', r.storage_bucket, 'path', r.storage_path
    ) order by r.position, r.id)
    from private.lesson_resources r
    where r.lesson_id = l.id
      and r.kind = 'pdf' and r.is_downloadable
      and r.storage_bucket = 'lesson-pdfs'
      and r.storage_path = l.course_id::text || '/' || l.id::text || '/' || r.id::text || '/file.pdf'
  ), '[]'::jsonb))
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where l.id = p_lesson_id and l.is_published and c.status = 'published'
    and (
      exists (select 1 from public.user_roles u where u.user_id = p_user_id and u.role = 'admin')
      or exists (select 1 from public.entitlements e where e.user_id = p_user_id
                 and e.course_id = l.course_id and e.revoked_at is null)
    );
$$;

revoke all on function public.server_lesson_pdf_resources(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_lesson_pdf_resources(uuid, uuid) to service_role;
