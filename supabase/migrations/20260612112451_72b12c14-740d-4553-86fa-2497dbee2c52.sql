
-- Storage RLS policies for backups & attachments (admin only)
DROP POLICY IF EXISTS "backups_admin_all" ON storage.objects;
CREATE POLICY "backups_admin_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "attachments_admin_all" ON storage.objects;
CREATE POLICY "attachments_admin_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'attachments' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'attachments' AND public.has_role(auth.uid(),'admin'));

-- Audit logs: remove client INSERT; add SECURITY DEFINER function
DROP POLICY IF EXISTS audit_logs_insert_self ON public.audit_logs;

CREATE OR REPLACE FUNCTION public.log_audit(
  _action_type text,
  _entity_type text,
  _entity_id text DEFAULT NULL,
  _old_values jsonb DEFAULT NULL,
  _new_values jsonb DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_logs(user_id, user_email, action_type, entity_type, entity_id, old_values, new_values, metadata, user_agent)
  VALUES (_uid, _email, _action_type, _entity_type, _entity_id, _old_values, _new_values, _metadata, _user_agent);
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit(text,text,text,jsonb,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text,text,text,jsonb,jsonb,jsonb,text) TO authenticated;

-- Notifications: only admins or self
DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_self_or_admin ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR user_id = auth.uid());

-- Inventory batches / transactions: admin or nurse only
DROP POLICY IF EXISTS inventory_batches_insert_authenticated ON public.inventory_batches;
CREATE POLICY inventory_batches_insert_admin_or_nurse ON public.inventory_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse'));

DROP POLICY IF EXISTS inventory_transactions_insert_authenticated ON public.inventory_transactions;
CREATE POLICY inventory_transactions_insert_admin_or_nurse ON public.inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse'))
              AND (performed_by IS NULL OR performed_by = auth.uid()));

-- user_roles: scope to authenticated only
DROP POLICY IF EXISTS user_roles_admin_manage ON public.user_roles;
CREATE POLICY user_roles_admin_manage ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_self_or_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Function hardening: revoke anon EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.staff_in_store(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.staff_in_store(uuid, uuid) TO authenticated;

-- search_path hardening
ALTER FUNCTION public.products_block_inventory_columns() SET search_path = public;
