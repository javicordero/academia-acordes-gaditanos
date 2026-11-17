-- Solo versionado local; no aplicar remotamente sin revisión y conciliación.
-- Un conflicto de nombre falla: no modifica un bucket existente por sorpresa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-pdfs', 'lesson-pdfs', false, 10485760, array['application/pdf']);

-- Restrictiva: incluso una política permisiva amplia existente queda bloqueada
-- para este bucket. El backend usa service_role, que omite RLS.
create policy lesson_pdfs_deny_direct
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'lesson-pdfs')
with check (bucket_id <> 'lesson-pdfs');
