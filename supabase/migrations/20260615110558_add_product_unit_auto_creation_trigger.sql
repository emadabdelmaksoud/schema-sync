-- Auto-create base product unit when a product is inserted
CREATE OR REPLACE FUNCTION public.create_base_product_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_units(product_id, unit_name, factor_to_base, is_base, sort_order)
  VALUES(
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.base_unit), ''), 'unit'),
    1,
    true,
    0
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_create_base_unit ON public.products;
CREATE TRIGGER products_create_base_unit
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.create_base_product_unit();

-- Grant execute permission
REVOKE ALL ON FUNCTION public.create_base_product_unit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_base_product_unit() TO authenticated;