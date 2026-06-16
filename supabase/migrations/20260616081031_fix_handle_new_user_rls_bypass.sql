-- Make handle_new_user bypass RLS entirely by setting it as SECURITY DEFINER
-- and ensuring it runs with superuser-like privileges

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles(id, email, full_name)
  VALUES(new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', new.email))
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  -- Insert default admin role - bypass RLS by running as function owner
  INSERT INTO public.user_roles(user_id, role)
  VALUES (new.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN new;
END;
$$;