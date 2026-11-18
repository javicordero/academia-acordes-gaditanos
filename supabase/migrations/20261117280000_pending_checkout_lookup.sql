-- Clasificación de una reserva nuestra aún no vinculada. No concede derechos,
-- no fija la sesión, no devuelve datos del pedido y no se expone a la API.
--
-- Contrato con el webhook: ante un evento firmado y pagado cuyo pedido todavía
-- no tiene sesión vinculada, 'pending' permite un reintento (503); cualquier
-- otro caso es definitivo (ACK) porque ese evento no podrá casar. La sesión
-- PRE-bind no puede cotejarse con la BD: sólo se valida su forma; el canonical
-- lookup y fulfill_paid_event exigen coincidencia exacta DESPUÉS del bind.
-- No se recibe actor ni intento desde metadata: el intento es único por pedido
-- y se deriva en servidor. Los hechos monetarios vienen del evento firmado y se
-- comparan aquí contra el pedido/snapshot; nunca sustituyen al snapshot.
--
-- Respuesta: 'pending' | 'unresolvable'.
create function public.server_checkout_pending_state(
  p_order uuid, p_session text, p_amount integer, p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  a private.checkout_attempts%rowtype;
  i public.order_items%rowtype;
begin
  if p_order is null
    or p_session is null or char_length(p_session) > 255 or octet_length(p_session) > 255
    or p_session !~ '^cs_(test|live)_[A-Za-z0-9]+$'
    or p_amount is null or p_amount < 0
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
  then return 'unresolvable'; end if;

  select * into o from public.orders where id = p_order;
  if not found then return 'unresolvable'; end if;
  select * into a from private.checkout_attempts where order_id = p_order;
  if not found then return 'unresolvable'; end if;
  if (select count(*) from public.order_items x where x.order_id = p_order) <> 1 then
    return 'unresolvable';
  end if;
  select * into i from public.order_items where order_id = p_order;

  if o.provider is distinct from 'stripe'
    or o.user_id is null
    or a.actor_id is null
    or a.actor_id is distinct from o.user_id
    or a.closed_at is not null
    or a.expires_at <= pg_catalog.clock_timestamp()
    or o.status not in ('pending', 'paid')
    or o.provider_checkout_session_id is not null
    or i.unit_amount_minor <> o.amount_total_minor
    or i.currency is distinct from o.currency
    or a.snapshot ->> 'amount_minor' is distinct from o.amount_total_minor::text
    or a.snapshot ->> 'currency' is distinct from o.currency
    or a.snapshot ->> 'course_id' is distinct from a.course_id::text
    or a.snapshot ->> 'price_id' is distinct from i.course_price_id::text
    or o.amount_total_minor <> p_amount
    or o.currency is distinct from p_currency
  then return 'unresolvable'; end if;

  return 'pending';
end $$;

revoke all on function public.server_checkout_pending_state(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.server_checkout_pending_state(uuid, text, integer, text)
  to service_role;
