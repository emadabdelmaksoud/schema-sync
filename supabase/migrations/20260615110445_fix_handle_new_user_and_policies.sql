-- Fix handle_new_user to create admin users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id, email, full_name)
  VALUES(new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', new.email))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  INSERT INTO public.user_roles(user_id, role)
  VALUES (new.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN new;
END;
$$;

-- Ensure has_role function is correct and has proper grants
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Make sure product_units insert policy allows product owner to create units
DROP POLICY IF EXISTS product_units_write_admin_or_owner ON public.product_units;
CREATE POLICY product_units_write_admin_or_owner ON public.product_units
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_units.product_id AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_units.product_id AND p.created_by = auth.uid()
    )
  );

-- Add INSERT policy for product_units that allows product owners
DROP POLICY IF EXISTS product_units_insert_admin_or_owner ON public.product_units;
CREATE POLICY product_units_insert_admin_or_owner ON public.product_units
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_units.product_id AND p.created_by = auth.uid()
    )
  );