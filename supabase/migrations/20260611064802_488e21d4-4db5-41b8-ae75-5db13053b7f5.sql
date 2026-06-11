create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_product_code()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.product_code is null or length(trim(new.product_code)) = 0 then
    new.product_code := 'PRD-' || lpad(nextval('public.product_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function public.generate_warehouse_code()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.warehouse_code is null or length(trim(new.warehouse_code)) = 0 then
    new.warehouse_code := 'WH-' || lpad(nextval('public.warehouse_code_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

grant usage, select on sequence public.product_code_seq to authenticated, service_role;
grant usage, select on sequence public.warehouse_code_seq to authenticated, service_role;

drop trigger if exists products_generate_code on public.products;
create trigger products_generate_code
  before insert on public.products
  for each row execute function public.generate_product_code();

drop trigger if exists warehouses_generate_code on public.warehouses;
create trigger warehouses_generate_code
  before insert on public.warehouses
  for each row execute function public.generate_warehouse_code();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists warehouses_set_updated_at on public.warehouses;
create trigger warehouses_set_updated_at
  before update on public.warehouses
  for each row execute function public.set_updated_at();

drop trigger if exists warehouse_sections_set_updated_at on public.warehouse_sections;
create trigger warehouse_sections_set_updated_at
  before update on public.warehouse_sections
  for each row execute function public.set_updated_at();