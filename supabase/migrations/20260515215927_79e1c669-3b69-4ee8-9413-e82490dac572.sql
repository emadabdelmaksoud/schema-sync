-- =========================================================
-- Warehouses + Warehouse Sections
-- =========================================================

create sequence if not exists public.warehouse_code_seq start 1;

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null unique,
  warehouse_name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists warehouses_name_ci_unique
  on public.warehouses (lower(warehouse_name));

create index if not exists warehouses_active_idx on public.warehouses (is_active);

alter table public.warehouses enable row level security;

create table if not exists public.warehouse_sections (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  section_name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists warehouse_sections_unique_per_wh
  on public.warehouse_sections (warehouse_id, lower(section_name));

create index if not exists warehouse_sections_wh_idx on public.warehouse_sections (warehouse_id);

alter table public.warehouse_sections enable row level security;

-- Auto-generate warehouse code
create or replace function public.generate_warehouse_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.warehouse_code is null or length(trim(new.warehouse_code)) = 0 then
    new.warehouse_code := 'WH-' || lpad(nextval('public.warehouse_code_seq')::text, 6, '0');
  end if;
  return new;
end; $$;

drop trigger if exists warehouses_generate_code on public.warehouses;
create trigger warehouses_generate_code before insert on public.warehouses
  for each row execute function public.generate_warehouse_code();

-- updated_at triggers
drop trigger if exists warehouses_set_updated_at on public.warehouses;
create trigger warehouses_set_updated_at before update on public.warehouses
  for each row execute function public.set_updated_at();

drop trigger if exists warehouse_sections_set_updated_at on public.warehouse_sections;
create trigger warehouse_sections_set_updated_at before update on public.warehouse_sections
  for each row execute function public.set_updated_at();

-- RLS: warehouses
drop policy if exists warehouses_read_authenticated on public.warehouses;
create policy warehouses_read_authenticated on public.warehouses
  for select to authenticated using (true);

drop policy if exists warehouses_insert_authenticated on public.warehouses;
create policy warehouses_insert_authenticated on public.warehouses
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists warehouses_update_admin_or_owner on public.warehouses;
create policy warehouses_update_admin_or_owner on public.warehouses
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or created_by = auth.uid())
  with check (public.has_role(auth.uid(), 'admin') or created_by = auth.uid());

drop policy if exists warehouses_delete_admin on public.warehouses;
create policy warehouses_delete_admin on public.warehouses
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- RLS: warehouse_sections
drop policy if exists warehouse_sections_read_authenticated on public.warehouse_sections;
create policy warehouse_sections_read_authenticated on public.warehouse_sections
  for select to authenticated using (true);

drop policy if exists warehouse_sections_insert_authenticated on public.warehouse_sections;
create policy warehouse_sections_insert_authenticated on public.warehouse_sections
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists warehouse_sections_update_admin_or_owner on public.warehouse_sections;
create policy warehouse_sections_update_admin_or_owner on public.warehouse_sections
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.warehouses w
      where w.id = warehouse_sections.warehouse_id
        and (w.created_by = auth.uid())
    )
    or created_by = auth.uid()
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.warehouses w
      where w.id = warehouse_sections.warehouse_id
        and (w.created_by = auth.uid())
    )
    or created_by = auth.uid()
  );

drop policy if exists warehouse_sections_delete_admin on public.warehouse_sections;
create policy warehouse_sections_delete_admin on public.warehouse_sections
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));
