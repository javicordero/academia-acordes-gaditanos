-- Precio de PRUEBA para checkout en modo test de Stripe: NO es el precio
-- comercial. La decisión del precio real sigue pendiente (D7); este importe no
-- fija condiciones de venta ni debe presentarse como oferta definitiva.
--
-- `price_1Ucw9AFgkhzJRwtxnyxifKAo` es un identificador de Stripe TEST
-- (1,00 EUR, pago único) facilitado por el promotor. No es un secreto, pero se
-- guarda solo en `private` (servidor): nunca en Angular, en `public.courses`
-- ni en la respuesta pública del catálogo.
--
-- La comprobación operativa del promotor (price activo, pago único, sin
-- recurring, moneda EUR y unit_amount=100) se hace en Stripe; esta migración
-- no la asume ni la sustituye. Tampoco activa cobros, concede derechos ni
-- cambia secretos o la configuración `enabled: false` de la Edge Function.
--
-- La lógica vive en una función, no en un bloque `do` anónimo: así la prueba
-- 0013 puede invocar LA MISMA función sobre un fixture creado después de
-- aplicar migraciones. El runner aplica las migraciones ANTES de los fixtures,
-- por lo que la llamada del final suele ser un no-op (no hay curso aún) y la
-- prueba reinyoca la función real, sin copiar el cuerpo.
-- Idempotente y no destructivo: solo actúa si el curso publicado con el slug
-- existe y no tiene precio activo; no desactiva, sustituye ni borra precios.
-- No añade grants sobre tablas. No se ha aplicado a ningún proyecto remoto.
create function public.apply_stripe_test_price_ref()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_id uuid;
  v_price_id uuid;
begin
  select c.id into v_course_id
  from public.courses c
  where c.slug = 'peimer-pasodoble'
    and c.status = 'published';

  if v_course_id is null then
    return;
  end if;

  -- Un precio activo (vigente o con la ventana vencida) bloquea: el índice
  -- único course_prices_one_active_per_course impide un segundo precio activo
  -- y esta migración nunca desactiva ni sustituye un precio existente.
  if exists (
    select 1
    from public.course_prices p
    where p.course_id = v_course_id
      and p.is_active
  ) then
    return;
  end if;

  -- Si la referencia ya pertenece a este curso (por ejemplo, asociada a un
  -- precio inactivo), no se reasigna ni se duplica.
  if exists (
    select 1
    from private.course_price_refs r
    join public.course_prices p on p.id = r.course_price_id
    where r.provider = 'stripe'
      and r.provider_price_id = 'price_1Ucw9AFgkhzJRwtxnyxifKAo'
      and p.course_id = v_course_id
  ) then
    return;
  end if;

  -- Si ya está enlazado a otro curso, falla con mensaje explícito: no se
  -- reasigna una referencia ajena.
  if exists (
    select 1
    from private.course_price_refs r
    where r.provider = 'stripe'
      and r.provider_price_id = 'price_1Ucw9AFgkhzJRwtxnyxifKAo'
  ) then
    raise exception
      'Precio de prueba Stripe ya enlazado a otro curso; no se reasigna';
  end if;

  insert into public.course_prices
    (course_id, amount_minor, currency, is_active, valid_from, valid_to)
  values
    (v_course_id, 100, 'EUR', true, now(), null)
  returning id into v_price_id;

  insert into private.course_price_refs
    (course_price_id, provider, provider_price_id)
  values
    (v_price_id, 'stripe', 'price_1Ucw9AFgkhzJRwtxnyxifKAo');
end $$;

-- Solo servidor: coherente con checkout_offer y los RPC de private.
revoke all on function public.apply_stripe_test_price_ref() from public, anon, authenticated;
grant execute on function public.apply_stripe_test_price_ref() to service_role;

-- Aplicación en el despliegue. Con el catálogo inicial no hay curso con este
-- slug, así que es un no-op; la prueba 0013 reinyoca la función con un fixture.
select public.apply_stripe_test_price_ref();
