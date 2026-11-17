-- Solo el servidor autenticado puede consultar referencias de precios de Stripe.
create function public.checkout_offer(p_actor uuid, p_course uuid)
returns table (owned boolean, slug text, price_id uuid, amount_minor integer, currency text, provider_price_id text)
language sql security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_actor and e.course_id = p_course and e.revoked_at is null
  ), c.slug, p.id, p.amount_minor, p.currency, r.provider_price_id
  from public.courses c
  join public.course_prices p on p.course_id = c.id
  join private.course_price_refs r on r.course_price_id = p.id and r.provider = 'stripe'
  where p_actor is not null and c.id = p_course and c.status = 'published'
    and p.is_active and p.amount_minor > 0
    and (p.valid_from is null or p.valid_from <= now())
    and (p.valid_to is null or now() < p.valid_to)
    and r.provider_price_id ~ '^price_[A-Za-z0-9]+$'
    and 1 = (select count(*) from public.course_prices p2
      where p2.course_id = c.id and p2.is_active
        and (p2.valid_from is null or p2.valid_from <= now())
        and (p2.valid_to is null or now() < p2.valid_to));
$$;
revoke all on function public.checkout_offer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.checkout_offer(uuid, uuid) to service_role;
