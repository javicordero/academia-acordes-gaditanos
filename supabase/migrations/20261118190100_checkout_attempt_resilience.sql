-- Corrección aditiva de checkout: un reintento del intento CANÓNICO ya cerrado
-- (sin importar que el navegador haya perdido la marca de sesión expirada) debe
-- reutilizar un sucesor DETERMINISTA, no devolver una orden que bind ya rechaza.
-- No modifica 20261117200000: sólo añade una columna y reemplaza la RPC con la
-- MISMA firma. Snapshot inmutable, bind y permisos quedan intactos.

alter table private.checkout_attempts
  add column successor_of uuid references private.checkout_attempts(attempt_id);

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
  -- Ambas claves se bloquean en orden fijo: intento global, después actor/curso.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attempt:' || p_attempt::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actor-course:' || p_actor::text || ':' || p_course::text, 0));
  if not exists(select 1 from auth.users u where u.id=p_actor) then raise exception 'actor missing'; end if;

  -- Estado terminal: MISMO mensaje para derecho activo o evento de pago
  -- recibido/tramitado para ese curso. No se crea pedido y no se revela cuál de
  -- ellos ocurrió. Un `orders.status='paid'` aislado (sin derecho ni evento) no
  -- basta: es un estado contable que otras pruebas y flujos fijan por su cuenta.
  if exists(select 1 from public.entitlements e where e.user_id=p_actor and e.course_id=p_course and e.revoked_at is null)
    or exists(
      select 1 from private.commerce_events ev
      join public.orders ev_o on ev_o.id=ev.order_reference
      join private.checkout_attempts ev_a on ev_a.order_id=ev_o.id
      where ev_o.user_id=p_actor and ev_a.course_id=p_course
        and ev.event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded')
    )
  then raise exception 'already owned'; end if;

  select * into a from private.checkout_attempts x where x.attempt_id=p_attempt;
  if found then
    if a.actor_id is distinct from p_actor or a.course_id is distinct from p_course then raise exception 'attempt conflict'; end if;
    target := a.attempt_id;
    loop
      -- Abierta y vigente: idempotencia original, se devuelve siempre el pedido.
      if a.closed_at is null and a.expires_at > pg_catalog.now() then
        return query select a.order_id, a.attempt_id, a.expires_at, a.snapshot; return;
      end if;
      -- Cerrada o vencida sin pago: sucesor derivado del propio intento, de su
      -- ancla temporal y de actor/curso. El ancla se fija al vencer, así que
      -- repetidas llamadas con el mismo estado dan SIEMPRE el mismo UUID.
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
        continue; -- cadena de sucesores: avanzar sin abrir otra orden
      end if;
      exit; -- no existe: se crea una sola vez
    end loop;
  else
    -- Intento nuevo: se conserva la limpieza y el conflicto de la RPC original.
    target := p_attempt;
    predecessor := null;
  end if;

  -- Cierre determinista de reservas vencidas (closed_at = expires_at, nunca
  -- now(): ahora forma parte del hash del sucesor). Sin segunda abierta.
  update private.checkout_attempts x
    set closed_at = coalesce(x.closed_at, x.expires_at)
    where x.actor_id=p_actor and x.course_id=p_course and x.closed_at is null and x.expires_at <= pg_catalog.now();
  if exists(select 1 from private.checkout_attempts x where x.actor_id=p_actor and x.course_id=p_course and x.closed_at is null) then raise exception 'open reservation conflict'; end if;

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
  return query select new_order,target,deadline,snap;
end $$;
revoke all on function public.reserve_checkout_order(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_checkout_order(uuid,uuid,uuid,integer) to service_role;
