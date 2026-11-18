-- Reordenación atómica de bloques y lecciones del panel /admin.
--
-- El modelo inicial impone unique (course_id, position) en course_sections y
-- unique (section_id, position) en lessons. Un UPDATE sucesivo por posición
-- colisiona a mitad de camino, así que el reordenamiento se hace en dos fases
-- dentro de una sola transacción: primero se desplazan todas las filas por
-- encima del máximo actual y después se les asigna 0..n-1. Un bloqueo
-- consultivo por padre serializa dos reordenamientos concurrentes.
--
-- Autorización:
--   * private.can_reorder_structure comprueba el rol en public.user_roles
--     (nunca claims ni metadata) y exige que p_user_id coincida con el sujeto
--     de la sesión; solo service_role puede actuar sin sujeto JWT.
--   * Las RPC son SECURITY DEFINER con search_path vacío y referencias
--     cualificadas. Se revoca PUBLIC y anon. Se concede EXECUTE a
--     authenticated porque el cliente Angular solo tiene la clave
--     publishable y la sesión del usuario: no hay service_role en el
--     navegador ni Edge Function en este bloque. Una sesión que no sea admin
--     recibe 42501 en la propia base de datos, no solo en la interfaz.
--
-- Contrato: se exige la lista COMPLETA de IDs del padre en el orden deseado.
-- Se rechazan duplicados, nulos, listas vacías, IDs ajenos, incompletos o
-- desconocidos. Solo se escribe `position`: se conservan borradores,
-- publicación, contenido, derechos, vídeo y progreso. No se publica nada.
--
-- No contiene datos reales, secretos ni datos personales. No se ha aplicado a
-- ningún proyecto Supabase remoto.

-- Comprobación centralizada del actor. SECURITY DEFINER para leer user_roles
-- sin depender de las políticas de RLS de la tabla de roles.
create or replace function private.can_reorder_structure(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject uuid := (select auth.uid());
  v_db_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
begin
  if p_user_id is null then
    return false;
  end if;

  if v_subject is not null then
    if v_subject <> p_user_id then
      return false;
    end if;
  elsif v_db_role is distinct from 'service_role' then
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = 'admin'
  );
end;
$$;

revoke all on function private.can_reorder_structure(uuid) from public, anon, authenticated;
grant execute on function private.can_reorder_structure(uuid) to service_role;

-- Bloques de un curso. Devuelve {"success": true, "updated": n, ...}.
create or replace function public.reorder_course_sections(
  p_user_id uuid,
  p_course_id uuid,
  p_ordered_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_offset_base integer;
begin
  if not private.can_reorder_structure(p_user_id) then
    raise exception 'reorder_forbidden' using errcode = '42501';
  end if;

  if p_course_id is null or p_ordered_ids is null
     or cardinality(p_ordered_ids) = 0
     or array_position(p_ordered_ids, null) is not null then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  if not exists (select 1 from public.courses c where c.id = p_course_id) then
    raise exception 'course_not_found' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('reorder_course_sections:' || p_course_id::text)::bigint);

  select count(*) into v_total
  from public.course_sections cs
  where cs.course_id = p_course_id;

  if cardinality(p_ordered_ids) <> v_total
     or (select count(distinct item.id) from unnest(p_ordered_ids) as item(id)) <> v_total then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  if exists (
    (
      select item.id
      from unnest(p_ordered_ids) as item(id)
      except
      select cs.id
      from public.course_sections cs
      where cs.course_id = p_course_id
    )
    union all
    (
      select cs.id
      from public.course_sections cs
      where cs.course_id = p_course_id
      except
      select item.id
      from unnest(p_ordered_ids) as item(id)
    )
  ) then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  -- Todas las posiciones son >= 0 y distintas: max + 1 es mayor que
  -- cualquier posición actual y mayor que n-1, así que la fase 1 no
  -- colisiona y la fase 2 puede reclamar 0..n-1 sin conflicto.
  select coalesce(max(cs.position), -1) + 1 into v_offset_base
  from public.course_sections cs
  where cs.course_id = p_course_id;

  update public.course_sections cs
  set position = v_offset_base + (item.ord - 1)::integer
  from unnest(p_ordered_ids) with ordinality as item(id, ord)
  where cs.id = item.id and cs.course_id = p_course_id;

  update public.course_sections cs
  set position = (item.ord - 1)::integer
  from unnest(p_ordered_ids) with ordinality as item(id, ord)
  where cs.id = item.id and cs.course_id = p_course_id;

  return jsonb_build_object(
    'success', true,
    'updated', v_total,
    'kind', 'sections',
    'parent_id', p_course_id
  );
end;
$$;

-- Lecciones de un bloque. Nunca se mueve course_id ni section_id.
create or replace function public.reorder_section_lessons(
  p_user_id uuid,
  p_section_id uuid,
  p_ordered_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_total integer;
  v_offset_base integer;
begin
  if not private.can_reorder_structure(p_user_id) then
    raise exception 'reorder_forbidden' using errcode = '42501';
  end if;

  if p_section_id is null or p_ordered_ids is null
     or cardinality(p_ordered_ids) = 0
     or array_position(p_ordered_ids, null) is not null then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  select cs.course_id into v_course_id
  from public.course_sections cs
  where cs.id = p_section_id;

  if not found then
    raise exception 'section_not_found' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('reorder_section_lessons:' || p_section_id::text)::bigint);

  select count(*) into v_total
  from public.lessons l
  where l.section_id = p_section_id;

  if cardinality(p_ordered_ids) <> v_total
     or (select count(distinct item.id) from unnest(p_ordered_ids) as item(id)) <> v_total then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  if exists (
    (
      select item.id
      from unnest(p_ordered_ids) as item(id)
      except
      select l.id
      from public.lessons l
      where l.section_id = p_section_id and l.course_id = v_course_id
    )
    union all
    (
      select l.id
      from public.lessons l
      where l.section_id = p_section_id and l.course_id = v_course_id
      except
      select item.id
      from unnest(p_ordered_ids) as item(id)
    )
    union all
    (
      select l.id
      from public.lessons l
      where l.id = any(p_ordered_ids)
        and (l.section_id <> p_section_id or l.course_id <> v_course_id)
    )
  ) then
    raise exception 'invalid_order' using errcode = '22023';
  end if;

  select coalesce(max(l.position), -1) + 1 into v_offset_base
  from public.lessons l
  where l.section_id = p_section_id;

  update public.lessons l
  set position = v_offset_base + (item.ord - 1)::integer
  from unnest(p_ordered_ids) with ordinality as item(id, ord)
  where l.id = item.id and l.section_id = p_section_id and l.course_id = v_course_id;

  update public.lessons l
  set position = (item.ord - 1)::integer
  from unnest(p_ordered_ids) with ordinality as item(id, ord)
  where l.id = item.id and l.section_id = p_section_id and l.course_id = v_course_id;

  return jsonb_build_object(
    'success', true,
    'updated', v_total,
    'kind', 'lessons',
    'parent_id', p_section_id
  );
end;
$$;

revoke all on function public.reorder_course_sections(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.reorder_section_lessons(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.reorder_course_sections(uuid, uuid, uuid[]) to authenticated, service_role;
grant execute on function public.reorder_section_lessons(uuid, uuid, uuid[]) to authenticated, service_role;
