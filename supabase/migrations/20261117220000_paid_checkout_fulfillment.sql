-- Unidad SQL de confirmacion de pago. Solo la llama service_role con hechos ya
-- verificados por el servidor upstream (firma de webhook, paid, mode, test).
-- No recibe JSON del proveedor, no verifica firmas y no se usa en la pagina de
-- exito. Checkout y webhook siguen deshabilitados: no hay integracion.
--
-- Estado: codigo local; no aplicado a ninguna base remota ni al repo remoto.
-- No concede acceso por rol admin (user_roles) ni por claim de JWT: solo por
-- derecho de compra. No inventa impuestos: el impuesto desconocido queda NULL y
-- un valor solo se fija una vez. No modifica el esquema ni los guards 200/210.

alter table private.commerce_events add column fulfillment_result text
  check (
    fulfillment_result is null
    or fulfillment_result in (
      'fulfilled', 'already_paid', 'already_entitled', 'already_processed',
      'requires_manual_review', 'missing_order', 'receipt_bound_to_other_user'
    )
  );

create function public.bind_checkout_session(
  p_actor uuid, p_order uuid, p_session text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  a private.checkout_attempts%rowtype;
begin
  if p_actor is null or p_order is null or p_session is null
    or char_length(p_session) > 255
    or octet_length(p_session) > 255
    or p_session !~ '^cs_(test|live)_[A-Za-z0-9]+$'
  then
    raise exception 'invalid binding';
  end if;

  -- Orden fijo: pedido y despues intento.
  select * into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'invalid binding';
  end if;
  select * into a from private.checkout_attempts where order_id = p_order for update;

  if o.user_id is distinct from p_actor
    or a.attempt_id is null
    or a.actor_id is distinct from p_actor
    or o.provider is distinct from 'stripe'
    or o.status <> 'pending'
    or a.closed_at is not null
    or a.expires_at <= pg_catalog.clock_timestamp()
    or not exists (select 1 from auth.users u where u.id = p_actor)
  then
    raise exception 'invalid binding';
  end if;

  if o.provider_checkout_session_id is not null then
    if o.provider_checkout_session_id = p_session then
      return 'already_bound';
    end if;
    raise exception 'binding conflict';
  end if;

  update public.orders
    set provider_checkout_session_id = p_session
    where id = p_order;
  return 'bound';
end $$;
revoke all on function public.bind_checkout_session(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.bind_checkout_session(uuid, uuid, text)
  to service_role;

-- fulfill_paid_event aplica un pago ya verificado y concede el derecho una vez.
-- Recibe hechos comprobados, sin JSON del proveedor. Bloquea recibo y despues
-- pedido, en orden fijo, dentro de la misma transaccion.
create function public.fulfill_paid_event(
  p_event_id text,
  p_order uuid,
  p_session text,
  p_actor uuid,
  p_amount_minor integer,
  p_currency text,
  p_tax_minor integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e private.commerce_events%rowtype;
  o public.orders%rowtype;
  a private.checkout_attempts%rowtype;
  i public.order_items%rowtype;
  existing public.entitlements%rowtype;
  result text;
begin
  if p_event_id is null
    or char_length(p_event_id) > 255
    or octet_length(p_event_id) > 255
    or p_order is null
    or p_session is null
    or char_length(p_session) > 255
    or octet_length(p_session) > 255
    or p_session !~ '^cs_(test|live)_[A-Za-z0-9]+$'
    or p_actor is null
    or p_amount_minor is null
    or p_amount_minor < 0
    or p_currency is null
    or p_currency !~ '^[A-Z]{3}$'
    or (p_tax_minor is not null and p_tax_minor < 0)
    -- Guard de forma: el impuesto no puede superar el total cobrado. No decide
    -- fiscalidad, tasa ni si el impuesto se suma o se incluye; 200 impide negativo.
    or (p_tax_minor is not null and p_tax_minor > p_amount_minor)
  then
    raise exception 'invalid payment';
  end if;

  -- Bloqueo del recibo antes que el pedido, en orden fijo.
  select * into e from private.commerce_events
    where provider = 'stripe' and external_event_id = p_event_id
    for update;
  if not found then
    raise exception 'event mismatch';
  end if;

  -- El recibo identifica la sesion y, si la conoce, el pedido.
  if e.stripe_session_id is distinct from p_session
    or (e.order_reference is not null and e.order_reference <> p_order)
  then
    raise exception 'event mismatch';
  end if;

  select * into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'order mismatch';
  end if;
  select * into a from private.checkout_attempts
    where order_id = p_order
    for update;
  if not found then
    raise exception 'order mismatch';
  end if;

  -- Solo pagos de checkout con sesion fijada por bind y estado abierto.
  if o.provider is distinct from 'stripe'
    or o.provider_checkout_session_id is null
    or o.provider_checkout_session_id <> p_session
    or o.status not in ('pending', 'paid')
    or e.event_type not in (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded'
    )
  then
    raise exception 'order mismatch';
  end if;

  if o.user_id is null or a.actor_id is null then
    return 'requires_manual_review';
  end if;
  if o.user_id <> p_actor or a.actor_id <> p_actor then
    raise exception 'actor mismatch';
  end if;

  -- Importe y moneda exactos contra el snapshot inmutable (pedido y linea).
  select * into i from public.order_items where order_id = p_order;
  if not found
    or (select count(*) from public.order_items x where x.order_id = p_order) <> 1
    or o.amount_total_minor <> p_amount_minor
    or o.currency <> p_currency
    or i.unit_amount_minor <> p_amount_minor
    or i.currency <> p_currency
    or a.snapshot ->> 'amount_minor' is distinct from p_amount_minor::text
    or a.snapshot ->> 'currency' is distinct from p_currency
    or a.snapshot ->> 'course_id' is distinct from a.course_id::text
    or a.snapshot ->> 'price_id' is distinct from i.course_price_id::text
  then
    raise exception 'order mismatch';
  end if;

  -- Impuesto: null no inventa 0; un valor ya fijado no puede modificarse.
  if p_tax_minor is not null
    and (o.amount_tax_minor is not null and o.amount_tax_minor <> p_tax_minor)
  then
    raise exception 'order mismatch';
  end if;

  -- Usuario borrado despues de la compra: no crear derecho ni cerrar el pedido.
  perform 1 from auth.users u where u.id = p_actor for key share;
  if not found then
    return 'requires_manual_review';
  end if;

  if e.processing_state = 'processed' and e.processed_at is not null then
    if e.fulfillment_result is null or o.status <> 'paid' then
      raise exception 'inconsistent processing';
    end if;
    return 'already_processed';
  end if;

  if e.processing_state <> 'received' or e.processed_at is not null then
    raise exception 'event state';
  end if;

  select * into existing from public.entitlements
    where user_id = p_actor
      and course_id = a.course_id
      and revoked_at is null
    for update;

  if existing.id is not null then
    -- Un derecho anterior de otro pedido no se reemplaza ni se duplica.
    if existing.order_id is distinct from p_order then
      result := 'already_entitled';
    -- Derecho del mismo pedido: debio nacer en una ejecucion anterior.
    elsif o.status <> 'paid' then
      raise exception 'inconsistent entitlement';
    -- El pedido ya pago concede el derecho; no se recrea.
    elsif existing.order_item_id is distinct from i.id then
      raise exception 'inconsistent entitlement';
    -- Reintento sobre un pedido ya pagado: nada que conceder.
    else
      result := 'already_paid';
    end if;
  end if;

  -- Impuesto desconocido: no se inventa 0; solo se fija una vez un valor recibido.
  if p_tax_minor is not null and o.amount_tax_minor is null then
    update public.orders set amount_tax_minor = p_tax_minor where id = p_order;
  end if;

  if result is null then
    if o.status = 'paid' then
      raise exception 'paid order requires review';
    end if;
    if o.user_id is null then
      raise exception 'actor mismatch';
    end if;
    -- Derecho activo sin caducidad programada (revocacion explicita futura).
    insert into public.entitlements(user_id, course_id, order_id, order_item_id)
      values (p_actor, a.course_id, p_order, i.id);
    result := 'fulfilled';
  end if;

  if result in ('fulfilled', 'already_paid') then
    update public.orders
      set status = 'paid',
          paid_at = coalesce(paid_at, pg_catalog.now())
      where id = p_order;
    update private.checkout_attempts
      set closed_at = coalesce(closed_at, pg_catalog.now())
      where order_id = p_order;
  end if;

  update private.commerce_events
    set processing_state = 'processed',
        processed_at = pg_catalog.now(),
        fulfillment_result = result
    where id = e.id;
  return result;
end $$;
revoke all on function public.fulfill_paid_event(text, uuid, text, uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.fulfill_paid_event(text, uuid, text, uuid, integer, text, integer)
  to service_role;
