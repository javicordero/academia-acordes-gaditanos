-- Academia Acordes Gaditanos — modelo inicial de datos y permisos.
--
-- Alcance de este bloque: identidad mínima, catálogo, derechos de acceso,
-- compra individual y progreso manual. No incluye foro, packs, cupones,
-- cuestionarios, eventos, reproducción de vídeo ni pasarela de pago.
--
-- Reglas de seguridad que fija esta migración:
--   * RLS activa en todas las tablas. La API solo expone el esquema `public`.
--   * `private` guarda identificadores de vídeo, rutas de recursos, precios
--     de proveedor y eventos de comercio; no se concede SELECT a clientes.
--   * Ningún cliente puede escribir pedidos, derechos de acceso (entitlements),
--     precios ni roles. Esas escrituras son exclusivas de servidor.
--   * Los derechos no caducan por fecha. Se pueden revocar explícitamente
--     (reembolso, contracargo u operación de soporte) y queda traza.
--   * Una lección marcada como muestra es visible sin compra; el resto exige
--     un entitlement activo del curso.
--   * El panel /admin futuro hará el CRUD editorial del catálogo con RLS de
--     admin. Los metadatos de vídeo/recursos, la subida a Bunny y los archivos
--     privados se gestionan desde servidor, no desde el cliente.
--
-- No contiene datos reales, precios, claves ni secretos. No se ha aplicado a
-- ningún proyecto Supabase remoto.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create type public.course_status as enum ('draft', 'published', 'archived');
create type public.course_level as enum ('iniciacion', 'basico', 'intermedio');
create type public.app_role as enum ('admin');
create type public.order_status as enum ('pending', 'paid', 'refunded', 'cancelled');
create type public.resource_kind as enum ('pdf', 'tablature', 'audio', 'image', 'other');

-- ---------------------------------------------------------------------------
-- Identidad
-- ---------------------------------------------------------------------------

-- Perfil público mínimo. No contiene correo, nombre legal ni rol.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (
    display_name is null or char_length(btrim(display_name)) between 1 and 60
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Datos mínimos visibles de una cuenta. Los datos personales van en private.profile_private.';

-- Datos personales que no deben exponerse por la API pública.
create table private.profile_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (
    full_name is null or char_length(btrim(full_name)) between 1 and 160
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roles de plataforma. Solo el servidor (service_role) puede escribir aquí.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

comment on table public.user_roles is
  'Roles administrativos. Se conceden y retiran solo desde servidor; no hay política de escritura para clientes.';

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  summary text,
  description text,
  level public.course_level not null default 'iniciacion',
  status public.course_status not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_published_at_required check (
    status <> 'published' or published_at is not null
  )
);

comment on table public.courses is
  'Catálogo editorial. Los borradores solo los ve un administrador.';

create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  summary text,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, course_id),
  unique (course_id, position)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  section_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  summary text,
  content_md text,
  position integer not null default 0 check (position >= 0),
  duration_seconds integer check (
    duration_seconds is null or duration_seconds >= 0
  ),
  is_free_preview boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug),
  unique (section_id, position),
  constraint lessons_section_course_fkey
    foreign key (section_id, course_id)
    references public.course_sections (id, course_id)
    on delete cascade
);

comment on column public.lessons.is_free_preview is
  'Muestra gratuita explícita. Solo se expone junto a un curso publicado y una lección publicada.';

-- Precio de catálogo legible por visitantes. El identificador del proveedor de
-- pago y las operaciones de comercio viven en `private` y solo los usa servidor.
create table public.course_prices (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_prices_validity check (
    valid_to is null or valid_from is null or valid_to > valid_from
  )
);

comment on column public.course_prices.amount_minor is
  'Importe en la unidad mínima de la moneda (por ejemplo, céntimos).';

-- ---------------------------------------------------------------------------
-- Comercio y derechos de acceso
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  status public.order_status not null default 'pending',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_total_minor integer not null check (amount_total_minor >= 0),
  amount_tax_minor integer check (amount_tax_minor >= 0),
  terms_version text,
  provider text not null default 'stripe' check (provider in ('stripe', 'manual')),
  provider_checkout_session_id text,
  provider_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  unique (provider, provider_checkout_session_id),
  unique (provider, provider_payment_intent_id)
);

comment on table public.orders is
  'Pedido y snapshot económico. La escritura es exclusiva de servidor tras un webhook verificado e idempotente.';
comment on column public.orders.user_id is
  'Puede quedar nulo al borrar la cuenta para conservar el registro contable; la política de conservación está pendiente.';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  course_price_id uuid references public.course_prices (id) on delete set null,
  course_title_snapshot text not null,
  unit_amount_minor integer not null check (unit_amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (order_id, course_id)
);

comment on table public.order_items is
  'Líneas de pedido congeladas con título e importe del momento de la compra.';

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  order_item_id uuid references public.order_items (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  constraint entitlements_revocation_after_grant check (
    revoked_at is null or revoked_at >= granted_at
  )
);

comment on table public.entitlements is
  'Derecho de acceso a un curso. No tiene fecha de caducidad programada; se revoca explícitamente desde servidor.';

create unique index entitlements_one_active_per_user_course
  on public.entitlements (user_id, course_id)
  where revoked_at is null;

create table public.lesson_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

comment on table public.lesson_progress is
  'Progreso manual del alumno. No se deduce automáticamente del visionado.';

-- ---------------------------------------------------------------------------
-- Metadatos privados de contenido y comercio
-- ---------------------------------------------------------------------------

create table private.lesson_videos (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  provider text not null default 'bunny' check (provider = 'bunny'),
  provider_video_id text not null,
  provider_library_id text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'pending' check (status in ('pending', 'ready', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_video_id)
);

create table private.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  kind public.resource_kind not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  storage_bucket text not null,
  storage_path text not null,
  is_downloadable boolean not null default true,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.course_price_refs (
  course_price_id uuid primary key references public.course_prices (id) on delete cascade,
  provider text not null check (provider = 'stripe'),
  provider_price_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_price_id)
);

create table private.commerce_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check (provider = 'stripe'),
  external_event_id text not null,
  event_type text not null,
  processing_state text not null default 'received'
    check (processing_state in ('received', 'processed', 'failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_summary text,
  unique (provider, external_event_id)
);

comment on table private.commerce_events is
  'Registro mínimo de idempotencia de webhooks. No guarda el cuerpo completo del evento.';

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

create index courses_status_idx on public.courses (status);
create index courses_sort_order_idx on public.courses (sort_order);
create index course_sections_course_id_idx on public.course_sections (course_id);
create index lessons_course_id_idx on public.lessons (course_id);
create index lessons_section_id_idx on public.lessons (section_id);
create index lessons_free_preview_idx on public.lessons (course_id)
  where is_free_preview and is_published;
create index course_prices_course_id_idx on public.course_prices (course_id);
create unique index course_prices_one_active_per_course
  on public.course_prices (course_id)
  where is_active;
create index orders_user_id_created_at_idx on public.orders (user_id, created_at desc);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_course_id_idx on public.order_items (course_id);
create index entitlements_user_id_idx on public.entitlements (user_id);
create index entitlements_course_id_idx on public.entitlements (course_id);
create index lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);
create index user_roles_role_idx on public.user_roles (role);
create index lesson_resources_lesson_id_idx on private.lesson_resources (lesson_id);

-- ---------------------------------------------------------------------------
-- Funciones y triggers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger profile_private_set_updated_at
  before update on private.profile_private
  for each row execute function private.set_updated_at();

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function private.set_updated_at();

create trigger course_sections_set_updated_at
  before update on public.course_sections
  for each row execute function private.set_updated_at();

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function private.set_updated_at();

create trigger course_prices_set_updated_at
  before update on public.course_prices
  for each row execute function private.set_updated_at();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

create trigger lesson_progress_set_updated_at
  before update on public.lesson_progress
  for each row execute function private.set_updated_at();

create trigger lesson_videos_set_updated_at
  before update on private.lesson_videos
  for each row execute function private.set_updated_at();

create trigger lesson_resources_set_updated_at
  before update on private.lesson_resources
  for each row execute function private.set_updated_at();

-- Crea el perfil mínimo al registrarse. El correo no se copia.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Comprobación de rol sin recursión de RLS: la función es SECURITY DEFINER y
-- consulta una tabla cuyo acceso de escritura es exclusivamente de servidor.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'admin'
  );
$$;

-- Derecho vigente del usuario actual sobre un curso. No caduca por tiempo.
create function private.has_course_entitlement(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.user_id = (select auth.uid())
      and e.course_id = p_course_id
      and e.revoked_at is null
  );
$$;

-- El progreso exige curso y lección publicados y un derecho vigente. Una
-- lección de muestra se puede ver sin compra, pero no genera progreso.
create function private.can_track_lesson_progress(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons l
    join public.courses c on c.id = l.course_id
    where l.id = p_lesson_id
      and l.is_published
      and c.status = 'published'
      and private.has_course_entitlement(l.course_id)
  );
$$;

revoke all on all functions in schema private from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.has_course_entitlement(uuid) to anon, authenticated, service_role;
grant execute on function private.can_track_lesson_progress(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.lessons enable row level security;
alter table public.course_prices enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.entitlements enable row level security;
alter table public.lesson_progress enable row level security;
alter table private.profile_private enable row level security;
alter table private.lesson_videos enable row level security;
alter table private.lesson_resources enable row level security;
alter table private.course_price_refs enable row level security;
alter table private.commerce_events enable row level security;

-- Perfiles: cada usuario ve y edita el suyo; un administrador puede leer todos
-- los perfiles públicos mínimos. No hay INSERT/DELETE para clientes.
create policy profiles_select_own_or_admin
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id or private.is_admin());

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Roles: el usuario solo puede leer su propio rol. Sin escritura de cliente.
create policy user_roles_select_own
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Catálogo: visitantes y alumnos ven cursos publicados. El administrador ve
-- también borradores y archivados y puede editarlos.
create policy courses_select_published_or_admin
  on public.courses for select
  to anon, authenticated
  using (status = 'published' or private.is_admin());

create policy courses_insert_admin
  on public.courses for insert
  to authenticated
  with check (private.is_admin());

create policy courses_update_admin
  on public.courses for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy courses_delete_admin
  on public.courses for delete
  to authenticated
  using (private.is_admin());

create policy course_sections_select_published_or_admin
  on public.course_sections for select
  to anon, authenticated
  using (
    private.is_admin()
    or exists (
      select 1
      from public.courses c
      where c.id = course_id
        and c.status = 'published'
    )
  );

create policy course_sections_insert_admin
  on public.course_sections for insert
  to authenticated
  with check (private.is_admin());

create policy course_sections_update_admin
  on public.course_sections for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy course_sections_delete_admin
  on public.course_sections for delete
  to authenticated
  using (private.is_admin());

-- Lecciones: solo publicadas de cursos publicados y, además, muestra gratuita
-- o derecho vigente. El administrador ve también borradores.
create policy lessons_select_published_or_admin
  on public.lessons for select
  to anon, authenticated
  using (
    private.is_admin()
    or (
      is_published
      and exists (
        select 1
        from public.courses c
        where c.id = course_id
          and c.status = 'published'
      )
      and (is_free_preview or private.has_course_entitlement(course_id))
    )
  );

create policy lessons_insert_admin
  on public.lessons for insert
  to authenticated
  with check (private.is_admin());

create policy lessons_update_admin
  on public.lessons for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy lessons_delete_admin
  on public.lessons for delete
  to authenticated
  using (private.is_admin());

-- Precios: solo precios activos y vigentes de cursos publicados. El
-- administrador puede leer el histórico; la escritura es de servidor.
create policy course_prices_select_public_or_admin
  on public.course_prices for select
  to anon, authenticated
  using (
    private.is_admin()
    or (
      is_active
      and (valid_from is null or valid_from <= now())
      and (valid_to is null or now() < valid_to)
      and exists (
        select 1
        from public.courses c
        where c.id = course_id
          and c.status = 'published'
      )
    )
  );

-- Pedidos, líneas y derechos: lectura solo de los propios. Sin escritura de
-- cliente; el administrador tampoco gestiona finanzas desde la API pública.
create policy orders_select_own
  on public.orders for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy order_items_select_own
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.user_id = (select auth.uid())
    )
  );

create policy entitlements_select_own
  on public.entitlements for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Progreso: lectura y borrado solo del propio; escritura solo con derecho
-- vigente y lección accesible. No se puede escribir progreso a nombre de otro.
create policy lesson_progress_select_own_authorized
  on public.lesson_progress for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and private.can_track_lesson_progress(lesson_id)
  );

create policy lesson_progress_insert_own_authorized
  on public.lesson_progress for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_track_lesson_progress(lesson_id)
  );

create policy lesson_progress_update_own_authorized
  on public.lesson_progress for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and private.can_track_lesson_progress(lesson_id)
  )
  with check (
    user_id = (select auth.uid())
    and private.can_track_lesson_progress(lesson_id)
  );

create policy lesson_progress_delete_own
  on public.lesson_progress for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Permisos de tabla/columna
-- ---------------------------------------------------------------------------

revoke create on schema public from public, anon, authenticated;

-- Perfiles
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Roles
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

-- Catálogo
revoke all on public.courses from anon, authenticated;
grant select on public.courses to anon, authenticated;
grant insert, update, delete on public.courses to authenticated;

revoke all on public.course_sections from anon, authenticated;
grant select on public.course_sections to anon, authenticated;
grant insert, update, delete on public.course_sections to authenticated;

revoke all on public.lessons from anon, authenticated;
grant select on public.lessons to anon, authenticated;
grant insert, update, delete on public.lessons to authenticated;

revoke all on public.course_prices from anon, authenticated;
grant select on public.course_prices to anon, authenticated;

-- Comercio y progreso
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;

revoke all on public.order_items from anon, authenticated;
grant select on public.order_items to authenticated;

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

revoke all on public.lesson_progress from anon, authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;

-- El servidor necesita acceso completo. `service_role` evita RLS en Supabase.
grant all on public.profiles to service_role;
grant all on public.user_roles to service_role;
grant all on public.courses to service_role;
grant all on public.course_sections to service_role;
grant all on public.lessons to service_role;
grant all on public.course_prices to service_role;
grant all on public.orders to service_role;
grant all on public.order_items to service_role;
grant all on public.entitlements to service_role;
grant all on public.lesson_progress to service_role;

-- Esquema privado: ni anon ni authenticated pueden leer estas tablas.
revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;
