-- Fix the chicken-and-egg problem with user_roles
-- When a new user signs up, handle_new_user tries to insert their role
-- But they don't yet have a role, so the INSERT policy blocks it

-- Drop the restrictive policy
DROP POLICY IF EXISTS user_roles_admin_manage ON user_roles;

-- New policy: anyone authenticated can insert their own role entry
-- This allows the handle_new_user trigger to work
CREATE POLICY "user_roles_insert_self" ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Keep the admin-only policy for UPDATE/DELETE
CREATE POLICY "user_roles_admin_modify" ON user_roles
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "user_roles_admin_delete" ON user_roles
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));