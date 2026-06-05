
-- Add staff to existing app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- New enums
DO $$ BEGIN CREATE TYPE public.department AS ENUM ('pharmacy','supplies'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tx_status AS ENUM ('added','dispensing','transferred','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.transfer_status AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- is_admin helper
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(_user_id,'admin')
$$;

-- Stores (with sub-stores)
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read stores" ON public.stores FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write stores" ON public.stores FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Staff assignments
CREATE TABLE public.store_staff (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY(store_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_staff TO authenticated;
GRANT ALL ON public.store_staff TO service_role;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view store_staff self or admin" ON public.store_staff FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "admin write store_staff" ON public.store_staff FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.staff_in_store(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.store_staff WHERE user_id=_user_id AND store_id=_store_id)
$$;

-- Items
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  department department NOT NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  current_quantity numeric NOT NULL DEFAULT 0,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.items(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read items admin or staff" ON public.items FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.staff_in_store(auth.uid(), store_id));
CREATE POLICY "insert items admin or staff" ON public.items FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.staff_in_store(auth.uid(), store_id));
CREATE POLICY "update items admin or staff" ON public.items FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.staff_in_store(auth.uid(), store_id));
CREATE POLICY "delete items admin only" ON public.items FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- Transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_no bigserial,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  department department NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  status tx_status NOT NULL,
  staff_user_id uuid REFERENCES auth.users(id),
  staff_name_snapshot text,
  store_name_snapshot text,
  transfer_to_store_id uuid REFERENCES public.stores(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.transactions(store_id);
CREATE INDEX ON public.transactions(item_id);
CREATE INDEX ON public.transactions(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.transactions_serial_no_seq TO authenticated;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read tx admin or staff" ON public.transactions FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.staff_in_store(auth.uid(), store_id));
CREATE POLICY "insert tx admin or staff" ON public.transactions FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.staff_in_store(auth.uid(), store_id));
CREATE POLICY "admin update tx" ON public.transactions FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));
CREATE POLICY "admin delete tx" ON public.transactions FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- Transfer requests
CREATE TABLE public.transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id uuid NOT NULL REFERENCES public.stores(id),
  to_store_id uuid NOT NULL REFERENCES public.stores(id),
  item_id uuid NOT NULL REFERENCES public.items(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  status transfer_status NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_requests TO authenticated;
GRANT ALL ON public.transfer_requests TO service_role;
ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read transfers admin or involved" ON public.transfer_requests FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR requested_by=auth.uid()
  OR public.staff_in_store(auth.uid(), from_store_id)
  OR public.staff_in_store(auth.uid(), to_store_id));
CREATE POLICY "create transfer staff or admin" ON public.transfer_requests FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.staff_in_store(auth.uid(), from_store_id));
CREATE POLICY "admin update transfers" ON public.transfer_requests FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Apply tx to balance
CREATE OR REPLACE FUNCTION public.apply_tx_to_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF tg_op='INSERT' THEN
    IF new.status='added' THEN
      UPDATE public.items SET current_quantity = current_quantity + new.quantity WHERE id = new.item_id;
    ELSE
      UPDATE public.items SET current_quantity = current_quantity - new.quantity WHERE id = new.item_id;
    END IF;
  END IF;
  RETURN new;
END $$;
CREATE TRIGGER trg_apply_tx AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_tx_to_balance();

-- Replace handle_new_user: first user = admin, rest = staff
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles(id, full_name, email)
  VALUES(new.id, COALESCE(new.raw_user_meta_data->>'full_name', new.email), new.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (new.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (new.id, 'staff') ON CONFLICT DO NOTHING;
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow admin to manage profiles + user_roles (some already exist; create if missing)
DO $$ BEGIN
  CREATE POLICY "admin manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
