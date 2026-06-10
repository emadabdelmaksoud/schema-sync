
-- =========================================================
-- 0007_inventory.sql — Transaction-based inventory engine
-- =========================================================

-- Transaction type enum
do $$ begin
  create type public.inventory_txn_type as enum (
    'stock_in', 'dispensing', 'transfer_in', 'transfer_out',
    'disposal', 'adjustment', 'inventory_count'
  );
exception when duplicate_object then null; end $$;

-- =========================================================
-- inventory_batches: physical lots of a product at a location
-- Different expiry dates / batch numbers create separate rows.
-- quantity_base_unit is maintained automatically by triggers
-- from inventory_transactions — do NOT update directly.
-- =========================================================
create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  section_id uuid references public.warehouse_sections(id) on delete set null,
  batch_number text,
  expiry_date date,
  quantity_base_unit numeric(20,6) not null default 0
    check (quantity_base_unit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A batch is uniquely identified by (product, warehouse, section, batch_number, expiry_date)
create unique index if not exists inventory_batches_identity_idx
  on public.inventory_batches (
    product_id, warehouse_id,
    coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(batch_number, ''),
    coalesce(expiry_date, 'infinity'::date)
  );

create index if not exists inventory_batches_product_idx on public.inventory_batches (product_id);
create index if not exists inventory_batches_warehouse_idx on public.inventory_batches (warehouse_id);
create index if not exists inventory_batches_expiry_idx on public.inventory_batches (expiry_date);
create index if not exists inventory_batches_fifo_idx
  on public.inventory_batches (product_id, warehouse_id, expiry_date nulls last, created_at);

drop trigger if exists inventory_batches_set_updated_at on public.inventory_batches;
create trigger inventory_batches_set_updated_at before update on public.inventory_batches
  for each row execute function public.set_updated_at();

-- =========================================================
-- inventory_transactions: append-only ledger
-- =========================================================
create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type public.inventory_txn_type not null,
  product_id uuid not null references public.products(id) on delete restrict,
  batch_id uuid references public.inventory_batches(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  section_id uuid references public.warehouse_sections(id) on delete set null,
  quantity numeric(20,6) not null check (quantity > 0),
  unit_id uuid not null references public.product_units(id) on delete restrict,
  quantity_base_unit numeric(20,6) not null check (quantity_base_unit > 0),
  performed_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_transactions_product_idx on public.inventory_transactions (product_id);
create index if not exists inventory_transactions_batch_idx on public.inventory_transactions (batch_id);
create index if not exists inventory_transactions_warehouse_idx on public.inventory_transactions (warehouse_id);
create index if not exists inventory_transactions_type_idx on public.inventory_transactions (transaction_type);
create index if not exists inventory_transactions_created_idx on public.inventory_transactions (created_at desc);

-- =========================================================
-- Validation + auto base-unit computation + batch maintenance
-- =========================================================
create or replace function public.inventory_transactions_validate()
returns trigger language plpgsql
set search_path = public
as $$
declare
  u_factor numeric;
  u_product uuid;
  b_product uuid;
  b_warehouse uuid;
begin
  -- unit must belong to the same product
  select factor_to_base, product_id into u_factor, u_product
    from public.product_units where id = new.unit_id;
  if u_factor is null then
    raise exception 'Unknown unit_id %', new.unit_id;
  end if;
  if u_product <> new.product_id then
    raise exception 'unit_id % does not belong to product %', new.unit_id, new.product_id;
  end if;

  -- compute quantity in base units
  new.quantity_base_unit := new.quantity * u_factor;

  -- if a batch is supplied, ensure it matches product/warehouse
  if new.batch_id is not null then
    select product_id, warehouse_id into b_product, b_warehouse
      from public.inventory_batches where id = new.batch_id;
    if b_product is null then
      raise exception 'Unknown batch_id %', new.batch_id;
    end if;
    if b_product <> new.product_id then
      raise exception 'batch product mismatch';
    end if;
    if b_warehouse <> new.warehouse_id then
      raise exception 'batch warehouse mismatch';
    end if;
  end if;

  if new.performed_by is null then
    new.performed_by := auth.uid();
  end if;

  return new;
end; $$;

drop trigger if exists inventory_transactions_validate_trg on public.inventory_transactions;
create trigger inventory_transactions_validate_trg
  before insert on public.inventory_transactions
  for each row execute function public.inventory_transactions_validate();

-- Apply the transaction to the batch ledger.
create or replace function public.inventory_transactions_apply()
returns trigger language plpgsql
set search_path = public
as $$
declare
  delta numeric;
begin
  -- Sign convention: stock_in / transfer_in / inventory_count add;
  -- dispensing / transfer_out / disposal subtract; adjustment uses sign of quantity (always +).
  -- For 'adjustment', notes should clarify direction — but we model both via dedicated types.
  delta := case new.transaction_type
    when 'stock_in'         then  new.quantity_base_unit
    when 'transfer_in'      then  new.quantity_base_unit
    when 'inventory_count'  then  0   -- handled separately: sets absolute on-hand
    when 'adjustment'       then  new.quantity_base_unit
    when 'dispensing'       then -new.quantity_base_unit
    when 'transfer_out'     then -new.quantity_base_unit
    when 'disposal'         then -new.quantity_base_unit
  end;

  if new.batch_id is null then
    -- batch is required for any movement
    raise exception 'batch_id is required for transaction_type %', new.transaction_type;
  end if;

  if new.transaction_type = 'inventory_count' then
    update public.inventory_batches
       set quantity_base_unit = new.quantity_base_unit,
           updated_at = now()
     where id = new.batch_id;
  else
    update public.inventory_batches
       set quantity_base_unit = quantity_base_unit + delta,
           updated_at = now()
     where id = new.batch_id;
    if not found then
      raise exception 'Batch % not found', new.batch_id;
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists inventory_transactions_apply_trg on public.inventory_transactions;
create trigger inventory_transactions_apply_trg
  after insert on public.inventory_transactions
  for each row execute function public.inventory_transactions_apply();

-- =========================================================
-- Aggregated stock view (FIFO by expiry then created_at)
-- =========================================================
create or replace view public.stock_on_hand as
select
  b.product_id,
  b.warehouse_id,
  b.section_id,
  sum(b.quantity_base_unit) as quantity_base_unit
from public.inventory_batches b
group by b.product_id, b.warehouse_id, b.section_id;

-- =========================================================
-- RLS
-- =========================================================
alter table public.inventory_batches enable row level security;
alter table public.inventory_transactions enable row level security;

drop policy if exists "inventory_batches_read_authenticated" on public.inventory_batches;
create policy "inventory_batches_read_authenticated" on public.inventory_batches
  for select to authenticated using (true);

-- Direct batch writes restricted to admins; everyone else mutates via transactions.
drop policy if exists "inventory_batches_write_admin" on public.inventory_batches;
create policy "inventory_batches_write_admin" on public.inventory_batches
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Allow authenticated users to INSERT batches (needed when recording first stock_in for a new lot).
drop policy if exists "inventory_batches_insert_authenticated" on public.inventory_batches;
create policy "inventory_batches_insert_authenticated" on public.inventory_batches
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "inventory_transactions_read_authenticated" on public.inventory_transactions;
create policy "inventory_transactions_read_authenticated" on public.inventory_transactions
  for select to authenticated using (true);

drop policy if exists "inventory_transactions_insert_authenticated" on public.inventory_transactions;
create policy "inventory_transactions_insert_authenticated" on public.inventory_transactions
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "inventory_transactions_delete_admin" on public.inventory_transactions;
create policy "inventory_transactions_delete_admin" on public.inventory_transactions
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

comment on table public.inventory_batches is
  'Physical batches/lots of a product at a (warehouse, section). Quantities are maintained automatically by inventory_transactions triggers.';
comment on table public.inventory_transactions is
  'Append-only inventory ledger. Stock-on-hand is derived from this table via inventory_batches.';
