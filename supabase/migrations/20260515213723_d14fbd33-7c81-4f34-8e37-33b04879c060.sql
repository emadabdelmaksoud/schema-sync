
-- 0001 auth + roles
do $$ begin
  create type public.app_role as enum ('admin', 'nurse');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'nurse') on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "user_roles_select_self_or_admin" on public.user_roles;
create policy "user_roles_select_self_or_admin" on public.user_roles
  for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_manage" on public.user_roles;
create policy "user_roles_admin_manage" on public.user_roles
  for all using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 0002 products
create extension if not exists pg_trgm;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  product_name text not null,
  barcode text unique,
  category text,
  manufacturer text,
  base_unit text not null default 'unit',
  reorder_level integer not null default 0 check (reorder_level >= 0),
  notes text,
  image_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_manufacturer_unique unique (product_name, manufacturer)
);

create index if not exists products_name_trgm_idx on public.products using gin (product_name gin_trgm_ops);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_manufacturer_idx on public.products (manufacturer);
create index if not exists products_barcode_idx on public.products (barcode);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create sequence if not exists public.product_code_seq start with 1;

create or replace function public.generate_product_code()
returns trigger language plpgsql as $$
begin
  if new.product_code is null or length(trim(new.product_code)) = 0 then
    new.product_code := 'PRD-' || lpad(nextval('public.product_code_seq')::text, 6, '0');
  end if;
  return new;
end; $$;

drop trigger if exists products_autocode on public.products;
create trigger products_autocode before insert on public.products
  for each row execute function public.generate_product_code();

alter table public.products enable row level security;

drop policy if exists "products_read_authenticated" on public.products;
create policy "products_read_authenticated" on public.products
  for select to authenticated using (true);

drop policy if exists "products_insert_authenticated" on public.products;
create policy "products_insert_authenticated" on public.products
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "products_update_admin_or_owner" on public.products;
create policy "products_update_admin_or_owner" on public.products
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or created_by = auth.uid())
  with check (public.has_role(auth.uid(), 'admin') or created_by = auth.uid());

drop policy if exists "products_delete_admin" on public.products;
create policy "products_delete_admin" on public.products
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- 0003 storage bucket
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_authenticated_insert" on storage.objects;
create policy "product_images_authenticated_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');

drop policy if exists "product_images_owner_update" on storage.objects;
create policy "product_images_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (owner = auth.uid() or public.has_role(auth.uid(), 'admin')));

drop policy if exists "product_images_owner_delete" on storage.objects;
create policy "product_images_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (owner = auth.uid() or public.has_role(auth.uid(), 'admin')));

comment on table public.products is
  'Master product catalog. Identity, barcode, category, manufacturer, base_unit, reorder_level, notes only. Expiry/batch/quantity live in inventory_batches (future).';

-- 0005 product_units
create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  unit_name text not null,
  factor_to_base numeric(20,6) not null check (factor_to_base > 0),
  is_base boolean not null default false,
  barcode text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, unit_name),
  unique (product_id, barcode) deferrable initially deferred
);

create unique index if not exists product_units_one_base_per_product
  on public.product_units (product_id) where is_base = true;

create or replace function public.product_units_validate()
returns trigger language plpgsql as $$
begin
  if new.is_base and new.factor_to_base <> 1 then
    raise exception 'Base unit must have factor_to_base = 1 (got %)', new.factor_to_base;
  end if;
  if new.barcode is not null and length(trim(new.barcode)) = 0 then
    new.barcode := null;
  end if;
  return new;
end; $$;

drop trigger if exists product_units_validate_trg on public.product_units;
create trigger product_units_validate_trg
  before insert or update on public.product_units
  for each row execute function public.product_units_validate();

drop trigger if exists product_units_set_updated_at on public.product_units;
create trigger product_units_set_updated_at before update on public.product_units
  for each row execute function public.set_updated_at();

create index if not exists product_units_product_idx on public.product_units (product_id);
create index if not exists product_units_barcode_idx on public.product_units (barcode);

insert into public.product_units (product_id, unit_name, factor_to_base, is_base, sort_order)
select p.id, coalesce(nullif(trim(p.base_unit), ''), 'unit'), 1, true, 0
from public.products p
where not exists (
  select 1 from public.product_units u where u.product_id = p.id and u.is_base
);

alter table public.product_units enable row level security;

drop policy if exists "product_units_read_authenticated" on public.product_units;
create policy "product_units_read_authenticated" on public.product_units
  for select to authenticated using (true);

drop policy if exists "product_units_write_admin_or_owner" on public.product_units;
create policy "product_units_write_admin_or_owner" on public.product_units
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.products p
      where p.id = product_units.product_id and p.created_by = auth.uid()
    )
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.products p
      where p.id = product_units.product_id and p.created_by = auth.uid()
    )
  );

create or replace function public.convert_units(
  _from_unit uuid, _to_unit uuid, _qty numeric
) returns numeric language plpgsql stable as $$
declare
  f_factor numeric; t_factor numeric;
  f_product uuid; t_product uuid;
begin
  select factor_to_base, product_id into f_factor, f_product
    from public.product_units where id = _from_unit;
  select factor_to_base, product_id into t_factor, t_product
    from public.product_units where id = _to_unit;
  if f_factor is null or t_factor is null then
    raise exception 'Unknown unit id';
  end if;
  if f_product <> t_product then
    raise exception 'Cannot convert between units of different products';
  end if;
  return _qty * (f_factor / t_factor);
end; $$;

comment on table public.product_units is
  'Units a product can be sold/stocked/dispensed in. Exactly one base unit per product (factor_to_base=1). All quantities convert through factor_to_base.';
