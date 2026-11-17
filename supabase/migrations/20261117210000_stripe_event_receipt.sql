-- Únicamente recepción; no tramita pagos ni concede derechos.
alter table private.commerce_events
  add column payload_sha256 text,
  add column livemode boolean,
  add column stripe_session_id text,
  add column order_reference uuid;

revoke all on private.commerce_events from public, anon, authenticated;

create function public.record_stripe_event(p_event_id text, p_event_type text, p_live_mode boolean, p_hash text, p_session_id text, p_order_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare e private.commerce_events%rowtype; inserted boolean;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$' or length(p_event_id)>255
    or p_event_type is null or p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded')
    or p_live_mode is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
    or p_session_id is null or p_session_id !~ '^cs_(test|live)_[A-Za-z0-9]+$' or length(p_session_id)>255
  then raise exception 'invalid event'; end if;
  insert into private.commerce_events(provider, external_event_id, event_type, payload_sha256, livemode, stripe_session_id, order_reference)
    values ('stripe', p_event_id, p_event_type, p_hash, p_live_mode, p_session_id, p_order_id)
    on conflict (provider, external_event_id) do nothing;
  inserted := found;
  select * into strict e from private.commerce_events where provider='stripe' and external_event_id=p_event_id for update;
  if e.payload_sha256 is distinct from p_hash then raise exception 'event conflict'; end if;
  if inserted then return 'created'; end if;
  if e.processing_state = 'processed' and e.processed_at is not null then return 'processed'; end if;
  return 'received_unprocessed';
end $$;
revoke all on function public.record_stripe_event(text,text,boolean,text,text,uuid) from public, anon, authenticated;
grant execute on function public.record_stripe_event(text,text,boolean,text,text,uuid) to service_role;
