-- Puente exclusivo del servidor para el webhook. fulfill_paid_event exige el
-- actor, importe y moneda, pero el cuerpo de Stripe no es fuente de verdad: el
-- handler solo usa metadata.order_id como identificador y obtiene el resto de
-- la BD. Esta RPC es de lectura, no concede nada ni cierra nada; la concesión
-- transaccional sigue siendo fulfill_paid_event.
--
-- Solo devuelve pedidos de Stripe pendientes o pagados y del mismo importe y
-- moneda que su linea y snapshot. No relaja ningun guard: fulfill_paid_event
-- vuelve a cotejar todo bajo bloqueo y falla con 'order mismatch' si algo no
-- cuadra. Si el pedido no cumple, no existe o la sesion no coincide, devuelve 0
-- filas (sin distinguir el motivo). No expone titulos, precios, proveedor ni
-- datos personales; la busqueda por id solo esta disponible para service_role
-- porque `restricted` impide SET ROLE y confunde una busqueda fallida con un
-- error; el endpoint conoce el pedido por el propio evento.
create function public.server_checkout_order_for_event(p_order uuid, p_session text)
returns table (user_id uuid, amount_minor integer, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.user_id, o.amount_total_minor, o.currency
  from public.orders o
  join private.checkout_attempts a on a.order_id = o.id
  join public.order_items i on i.order_id = o.id
  where o.id = p_order
    and p_session is not null
    and char_length(p_session) <= 255
    and octet_length(p_session) <= 255
    and p_session ~ '^cs_(test|live)_[A-Za-z0-9]+$'
    and o.provider = 'stripe'
    and o.provider_checkout_session_id = p_session
    and o.status in ('pending', 'paid')
    and a.actor_id is not null
    and a.actor_id = o.user_id
    and 1 = (select count(*) from public.order_items x where x.order_id = o.id)
    and i.unit_amount_minor = o.amount_total_minor
    and i.currency = o.currency
    and a.snapshot ->> 'amount_minor' = o.amount_total_minor::text
    and a.snapshot ->> 'currency' = o.currency
    and a.snapshot ->> 'course_id' = a.course_id::text
    and a.snapshot ->> 'price_id' = i.course_price_id::text
  limit 1;
$$;
revoke all on function public.server_checkout_order_for_event(uuid, text) from public, anon, authenticated;
grant execute on function public.server_checkout_order_for_event(uuid, text) to service_role;
