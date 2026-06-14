
-- 1) Drop legacy warehouse policies that reference profiles.role (broken)
DROP POLICY IF EXISTS "Admins can insert warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Admins can update warehouses" ON public.warehouses;

-- 2) Re-create with has_role() so admins can actually insert
CREATE POLICY warehouses_insert_admin ON public.warehouses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- (warehouses_update_admin_or_owner already exists and is correct)

-- 3) Backfill profiles.role from user_roles for any legacy reads still using it
UPDATE public.profiles p
SET role = ur.role::text
FROM public.user_roles ur
WHERE ur.user_id = p.id;

-- 4) Keep profiles.role in sync with user_roles going forward
CREATE OR REPLACE FUNCTION public.sync_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET role = 'user' WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  UPDATE public.profiles SET role = NEW.role::text WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_role ON public.user_roles;
CREATE TRIGGER trg_sync_profile_role
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role();
