CREATE POLICY "clinic_assets_read_authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clinic-assets');
CREATE POLICY "clinic_assets_write_admin" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clinic-assets' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "clinic_assets_update_admin" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'clinic-assets' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "clinic_assets_delete_admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clinic-assets' AND public.has_role(auth.uid(),'admin'));
