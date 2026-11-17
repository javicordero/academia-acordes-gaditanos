-- Puente local, no conectado al endpoint de checkout.
create table private.checkout_order_config (
  singleton boolean primary key default true check (singleton),
  terms_version text not null check (length(btrim(terms_version)) between 1 and 200)
);
alter table private.checkout_order_config enable row level security;
revoke all on private.checkout_order_config from public, anon, authenticated;

create table private.checkout_attempts (
  attempt_id uuid primary key,
  actor_id uuid references auth.users(id) on delete set null,
  course_id uuid not null references public.courses(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  expires_at timestamptz not null,
  closed_at timestamptz,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.checkout_attempts enable row level security;
revoke all on private.checkout_attempts from public, anon, authenticated;
create unique index checkout_one_open on private.checkout_attempts(actor_id, course_id) where closed_at is null and actor_id is not null;

create function private.protect_checkout_snapshot() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'checkout_attempts' or exists(select 1 from private.checkout_attempts a where a.order_id=old.order_id) then
      raise exception 'immutable checkout history';
    end if;
    return old;
  end if;
  if tg_table_name = 'checkout_attempts' then
    if new.attempt_id is distinct from old.attempt_id or new.course_id is distinct from old.course_id or new.order_id is distinct from old.order_id or new.expires_at is distinct from old.expires_at or new.snapshot is distinct from old.snapshot or new.created_at is distinct from old.created_at or (new.actor_id is distinct from old.actor_id and new.actor_id is not null) then raise exception 'immutable checkout snapshot'; end if;
  elsif tg_table_name = 'orders' then
    -- Tax is unknown at reservation. Server may set it once; no tax calculation here.
    if exists(select 1 from private.checkout_attempts a where a.order_id=old.id) and (new.currency is distinct from old.currency or new.amount_total_minor is distinct from old.amount_total_minor or (old.amount_tax_minor is not null and new.amount_tax_minor is distinct from old.amount_tax_minor) or new.terms_version is distinct from old.terms_version or new.provider is distinct from old.provider or (new.user_id is distinct from old.user_id and new.user_id is not null)) then raise exception 'immutable order snapshot'; end if;
  else
    if exists(select 1 from private.checkout_attempts a where a.order_id=old.order_id) and (new.order_id is distinct from old.order_id or new.course_id is distinct from old.course_id or (new.course_price_id is distinct from old.course_price_id and new.course_price_id is not null) or new.course_title_snapshot is distinct from old.course_title_snapshot or new.unit_amount_minor is distinct from old.unit_amount_minor or new.currency is distinct from old.currency) then raise exception 'immutable item snapshot'; end if;
  end if;
  return new;
end $$;
revoke all on function private.protect_checkout_snapshot() from public, anon, authenticated;
create trigger checkout_snapshot_guard before update on private.checkout_attempts for each row execute function private.protect_checkout_snapshot();
create trigger checkout_order_guard before update on public.orders for each row execute function private.protect_checkout_snapshot();
create trigger checkout_item_guard before update on public.order_items for each row execute function private.protect_checkout_snapshot();
create trigger checkout_attempt_delete_guard before delete on private.checkout_attempts for each row execute function private.protect_checkout_snapshot();
create trigger checkout_item_delete_guard before delete on public.order_items for each row execute function private.protect_checkout_snapshot();

create function public.reserve_checkout_order(p_actor uuid, p_course uuid, p_attempt uuid, p_ttl_seconds integer)
returns table(order_id uuid, canonical_attempt_id uuid, expires_at timestamptz, snapshot jsonb)
language plpgsql security definer set search_path = '' as $$
declare a private.checkout_attempts%rowtype; o record; terms text; new_order uuid; snap jsonb; deadline timestamptz;
begin
  if p_actor is null or p_course is null or p_attempt is null or p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 86400 then raise exception 'invalid reservation'; end if;
  -- Ambas claves se bloquean en orden fijo: intento global, después actor/curso.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('attempt:' || p_attempt::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('actor-course:' || p_actor::text || ':' || p_course::text, 0));
  if not exists(select 1 from auth.users u where u.id=p_actor) then raise exception 'actor missing'; end if;
  select * into a from private.checkout_attempts x where x.attempt_id=p_attempt;
  if found then
    if a.actor_id is distinct from p_actor or a.course_id is distinct from p_course then raise exception 'attempt conflict'; end if;
    return query select a.order_id, a.attempt_id, a.expires_at, a.snapshot; return;
  end if;
  if exists(select 1 from public.entitlements e where e.user_id=p_actor and e.course_id=p_course and e.revoked_at is null) then raise exception 'already owned'; end if;
  update private.checkout_attempts x set closed_at=pg_catalog.now() where x.actor_id=p_actor and x.course_id=p_course and x.closed_at is null and x.expires_at <= pg_catalog.now();
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
  insert into private.checkout_attempts(attempt_id,actor_id,course_id,order_id,expires_at,snapshot) values(p_attempt,p_actor,p_course,new_order,deadline,snap);
  return query select new_order,p_attempt,deadline,snap;
end $$;
revoke all on function public.reserve_checkout_order(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_checkout_order(uuid,uuid,uuid,integer) to service_role;
