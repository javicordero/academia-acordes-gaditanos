-- Endurecimiento aditivo de checkout/webhook tras segunda auditoría.
-- No toca migraciones históricas: añade unicidad y RPCs nuevas, y reemplaza
-- record_stripe_event / reserve_checkout_order con la MISMA firma y salidas.
-- Sin precios nuevos, sin packs, sin ofertas, sin reembolsos y sin Stripe live.
-- Ningún secreto ni dato personal: IDs opacos y hechos firmados únicamente.

-- (3) Dedup lógico: Stripe puede enviar ids de evento distintos para la misma
-- sesión. Un evento sin sesión no queda sujeto a esta restricción.
create unique index if not exists checkout_event_session_unique
  on private.commerce_events (provider, event_type, stripe_session_id)
  where stripe_session_id is not null;

-- (2)(3) Registro canónico. Devuelve el evento lógico ya existente cuando llega
-- otro id para la misma (proveedor, tipo, sesión), sin duplicar fulfillment.
-- El hash sólo se compara cuando coincide el id externo: así se conserva el
-- rechazo de un mismo evento con cuerpo alterado.
create function public.record_stripe_event_canonical(
  p_event_id text, p_event_type text, p_live_mode boolean,
  p_hash text, p_session_id text, p_order_id uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e private.commerce_events%rowtype;
  inserted boolean;
  status text;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$' or length(p_event_id) > 255
    or p_event_type is null or p_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
    or p_live_mode is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or p_session_id is null or p_session_id !~ '^cs_(test|live)_[A-Za-z0-9]+$' or length(p_session_id) > 255
  then raise exception 'invalid event'; end if;

  insert into private.commerce_events(provider, external_event_id, event_type, payload_sha256, livemode, stripe_session_id, order_reference)
    values ('stripe', p_event_id, p_event_type, p_hash, p_live_mode, p_session_id, p_order_id)
    on conflict do nothing;
  inserted := found;

  select * into e
    from private.commerce_events
   where provider = 'stripe'
     and (external_event_id = p_event_id
          or (stripe_session_id = p_session_id and event_type = p_event_type))
   order by (external_event_id = p_event_id) desc, received_at asc
   limit 1
   for update;
  if not found then raise exception 'event conflict'; end if;
  if e.external_event_id = p_event_id and e.payload_sha256 is distinct from p_hash then
    raise exception 'event conflict';
  end if;

  if inserted then
    status := 'created';
  elsif e.processing_state = 'processed' and e.processed_at is not null then
    status := 'processed';
  else
    status := 'received_unprocessed';
  end if;
  return pg_catalog.jsonb_build_object('status', status, 'event_id', e.external_event_id);
end $$;
revoke all on function public.record_stripe_event_canonical(text,text,boolean,text,text,uuid) from public, anon, authenticated;
grant execute on function public.record_stripe_event_canonical(text,text,boolean,text,text,uuid) to service_role;

-- Firma histórica intacta: la RPC antigua es un envoltorio de la canónica.
create or replace function public.record_stripe_event(
  p_event_id text, p_event_type text, p_live_mode boolean,
  p_hash text, p_session_id text, p_order_id uuid
)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  return public.record_stripe_event_canonical(
    p_event_id, p_event_type, p_live_mode, p_hash, p_session_id, p_order_id
  ) ->> 'status';
end $$;
revoke all on function public.record_stripe_event(text,text,boolean,text,text,uuid) from public, anon, authenticated;
grant execute on function public.record_stripe_event(text,text,boolean,text,text,uuid) to service_role;

-- (1)(2) Un evento firmado que no concede acceso queda registrado como no
-- concedido, NO como terminal con derecho. Nunca degrada una concesión previa.
create function public.mark_stripe_event_no_grant(
  p_event_id text, p_session_id text, p_event_type text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare e private.commerce_events%rowtype;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$' or length(p_event_id) > 255
    or p_session_id is null or p_session_id !~ '^cs_(test|live)_[A-Za-z0-9]+$' or length(p_session_id) > 255
    or p_event_type is null or p_event_type not in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
  then raise exception 'invalid event'; end if;

  select * into e
    from private.commerce_events
   where provider = 'stripe'
     and (external_event_id = p_event_id
          or (stripe_session_id = p_session_id and event_type = p_event_type))
   order by (external_event_id = p_event_id) desc, received_at asc
   limit 1
   for update;
  if not found then return 'missing'; end if;
  if e.processing_state = 'processed'
     and e.fulfillment_result in ('fulfilled', 'already_paid', 'already_entitled') then
    return 'kept_grant';
  end if;

  update private.commerce_events
     set processing_state = 'processed',
         processed_at = coalesce(processed_at, pg_catalog.now()),
         fulfillment_result = 'requires_manual_review'
   where id = e.id;
  return 'marked';
end $$;
revoke all on function public.mark_stripe_event_no_grant(text,text,text) from public, anon, authenticated;
grant execute on function public.mark_stripe_event_no_grant(text,text,text) to service_role;

-- (4) Recuperación ante binding conflict: Read-only, service_role, sin conceder.
create function public.server_checkout_bound_session(p_actor uuid, p_order uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; a private.checkout_attempts%rowtype;
begin
  if p_actor is null or p_order is null then return null; end if;
  select * into o from public.orders where id = p_order;
  if not found then return null; end if;
  select * into a from private.checkout_attempts where order_id = p_order;
  if not found then return null; end if;
  if o.user_id is distinct from p_actor or a.actor_id is distinct from p_actor
    or o.provider is distinct from 'stripe' or o.status <> 'pending'
    or a.closed_at is not null or a.expires_at <= pg_catalog.now()
    or o.provider_checkout_session_id is null
    or length(o.provider_checkout_session_id) > 255
    or o.provider_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9]+$'
  then return null; end if;
  return o.provider_checkout_session_id;
end $$;
revoke all on function public.server_checkout_bound_session(uuid,uuid) from public, anon, authenticated;
grant execute on function public.server_checkout_bound_session(uuid,uuid) to service_role;

-- (1)(5) Un recibo recibido/rechazado NO es terminal. Sólo bloquea un derecho
-- activo o un evento PROCESADO con resultado de concesión. Se revalúa antes de
-- inserting el sucesor y justo después, para que una carrera pago/reserva
-- revierta la orden huérfana completa en la misma transacción.
create function private.checkout_grant_exists(p_actor uuid, p_course uuid)
returns boolean
language sql security definer set search_path = '' as $$
  select exists(
    select 1 from public.entitlements e
     where e.user_id = p_actor and e.course_id = p_course and e.revoked_at is null
  ) or exists(
    select 1 from private.commerce_events ev
      join public.orders ev_o on ev_o.id = ev.order_reference
      join private.checkout_attempts ev_a on ev_a.order_id = ev_o.id
     where ev_o.user_id = p_actor and ev_a.course_id = p_course
       and ev.event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
       and ev.processing_state = 'processed'
       and ev.fulfillment_result in ('fulfilled', 'already_paid', 'already_entitled')
  );
$$;
revoke all on function private.checkout_grant_exists(uuid,uuid) from public, anon, authenticated;

create or replace function public.reserve_checkout_order(p_actor uuid, p_course uuid, p_attempt uuid, p_ttl_seconds integer)
returns table(order_id uuid, canonical_attempt_id uuid, expires_at timestamptz, snapshot jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  a private.checkout_attempts%rowtype;
  o record;
  terms text;
  new_order uuid;
  snap jsonb;
  deadline timestamptz;
  anchor timestamptz;
  digest text;
  target uuid;
  predecessor uuid := null;
  depth integer := 0;
begin
  if p_actor is null or p_course is null or p_attempt is null or p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 86400 then raise exception 'invalid reservation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attempt:' || p_attempt::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actor-course:' || p_actor::text || ':' || p_course::text, 0));
  if not exists(select 1 from auth.users u where u.id=p_actor) then raise exception 'actor missing'; end if;

  -- Terminal: derecho activo o pago PROCESADO con concesión. Un evento
  -- 'received'/'failed' con fulfillment_result nulo NO cierra la puerta.
  if private.checkout_grant_exists(p_actor, p_course) then raise exception 'already owned'; end if;

  select * into a from private.checkout_attempts x where x.attempt_id=p_attempt;
  if found then
    if a.actor_id is distinct from p_actor or a.course_id is distinct from p_course then raise exception 'attempt conflict'; end if;
    target := a.attempt_id;
    loop
      if a.closed_at is null and a.expires_at > pg_catalog.now() then
        return query select a.order_id, a.attempt_id, a.expires_at, a.snapshot; return;
      end if;
      depth := depth + 1;
      if depth > 8 then raise exception 'open reservation conflict'; end if;
      anchor := coalesce(a.closed_at, a.expires_at);
      digest := pg_catalog.md5('checkout-successor:' || a.attempt_id::text || ':' || anchor::text || ':' || p_actor::text || ':' || p_course::text);
      predecessor := a.attempt_id;
      target := (
        pg_catalog.substr(digest,1,8) || '-' || pg_catalog.substr(digest,9,4) || '-' ||
        '5' || pg_catalog.substr(digest,14,3) || '-' || '8' || pg_catalog.substr(digest,18,3) || '-' ||
        pg_catalog.substr(digest,21,12)
      )::uuid;
      select * into a from private.checkout_attempts x where x.attempt_id=target;
      if found then
        if a.actor_id is distinct from p_actor or a.course_id is distinct from p_course then raise exception 'attempt conflict'; end if;
        continue;
      end if;
      exit;
    end loop;
  else
    target := p_attempt;
    predecessor := null;
  end if;

  update private.checkout_attempts x
    set closed_at = coalesce(x.closed_at, x.expires_at)
    where x.actor_id=p_actor and x.course_id=p_course and x.closed_at is null and x.expires_at <= pg_catalog.now();
  if exists(select 1 from private.checkout_attempts x where x.actor_id=p_actor and x.course_id=p_course and x.closed_at is null) then raise exception 'open reservation conflict'; end if;

  -- (5) Revalidación antes de abrir la orden sucesora.
  if private.checkout_grant_exists(p_actor, p_course) then raise exception 'already owned'; end if;

  select c.title, c.slug, p.id as price_id, p.amount_minor, p.currency, r.provider_price_id into o
    from public.courses c join public.course_prices p on p.course_id=c.id join private.course_price_refs r on r.course_price_id=p.id and r.provider='stripe'
    where c.id=p_course and c.status='published' and p.is_active and p.amount_minor>0
      and (p.valid_from is null or p.valid_from<=pg_catalog.now()) and (p.valid_to is null or p.valid_to>pg_catalog.now())
      and r.provider_price_id ~ '^price_[A-Za-z0-9]+$'
      and 1=(select count(*) from public.course_prices p2 where p2.course_id=c.id and p2.is_active and (p2.valid_from is null or p2.valid_from<=pg_catalog.now()) and (p2.valid_to is null or p2.valid_to>pg_catalog.now()));
  if not found then raise exception 'offer unavailable'; end if;
  select c.terms_version into terms from private.checkout_order_config c where c.singleton;
  if terms is null then raise exception 'terms configuration missing'; end if;
  deadline := pg_catalog.now() + pg_catalog.make_interval(secs => p_ttl_seconds);
  snap := pg_catalog.jsonb_build_object('course_id',p_course,'course_slug',o.slug,'course_title',o.title,'price_id',o.price_id,'amount_minor',o.amount_minor,'currency',o.currency,'provider','stripe','provider_price_id',o.provider_price_id,'terms_version',terms);
  insert into public.orders(user_id,currency,amount_total_minor,amount_tax_minor,terms_version,provider) values(p_actor,o.currency,o.amount_minor,null,terms,'stripe') returning id into new_order;
  insert into public.order_items(order_id,course_id,course_price_id,course_title_snapshot,unit_amount_minor,currency) values(new_order,p_course,o.price_id,o.title,o.amount_minor,o.currency);
  insert into private.checkout_attempts(attempt_id,actor_id,course_id,order_id,expires_at,snapshot,successor_of)
    values(target,p_actor,p_course,new_order,deadline,snap,predecessor);

  -- (5) Un pago cometido en la ventana entre el check y la inserción revierte
  -- TODO el intento (incluida la orden) al lanzar dentro de la transacción.
  if private.checkout_grant_exists(p_actor, p_course) then raise exception 'already owned'; end if;
  return query select new_order,target,deadline,snap;
end $$;
revoke all on function public.reserve_checkout_order(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_checkout_order(uuid,uuid,uuid,integer) to service_role;
