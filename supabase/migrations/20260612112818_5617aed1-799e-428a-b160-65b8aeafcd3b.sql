
DROP POLICY IF EXISTS warehouses_insert_authenticated ON public.warehouses;

DROP POLICY IF EXISTS inventory_batches_read_authenticated ON public.inventory_batches;
CREATE POLICY inventory_batches_read_admin_or_nurse ON public.inventory_batches
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse'));

DROP POLICY IF EXISTS inventory_transactions_read_authenticated ON public.inventory_transactions;
CREATE POLICY inventory_transactions_read_admin_or_nurse ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse'));
