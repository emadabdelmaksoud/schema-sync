
-- Pin search_path on the remaining functions
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.generate_product_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.product_code is null or length(trim(new.product_code)) = 0 then
    new.product_code := 'PRD-' || lpad(nextval('public.product_code_seq')::text, 6, '0');
  end if;
  return new;
end; $$;

create or replace function public.product_units_validate()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_base and new.factor_to_base <> 1 then
    raise exception 'Base unit must have factor_to_base = 1 (got %)', new.factor_to_base;
  end if;
  if new.barcode is not null and length(trim(new.barcode)) = 0 then
    new.barcode := null;
  end if;
  return new;
end; $$;

create or replace function public.convert_units(
  _from_unit uuid, _to_unit uuid, _qty numeric
) returns numeric language plpgsql stable set search_path = public as $$
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

-- Lock down SECURITY DEFINER functions: only the trigger context (postgres)
-- and authenticated clients (for has_role used in RLS) may execute.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;

-- Tighten the public product-images bucket: replace the broad SELECT policy
-- with one that only lets authenticated users list/read objects via the API.
-- The bucket stays "public" so direct getPublicUrl() image URLs still work.
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_authenticated_read" on storage.objects
  for select to authenticated using (bucket_id = 'product-images');
