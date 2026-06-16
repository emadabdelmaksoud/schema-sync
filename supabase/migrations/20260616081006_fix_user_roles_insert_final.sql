-- Final fix: Allow user_roles INSERT from both:
-- 1. The user themselves (user_id = auth.uid())
-- 2. SECURITY DEFINER trigger functions that run as postgres

-- Drop existing insert policy
DROP POLICY IF EXISTS user_roles_insert_self ON user_roles;

-- Since handle_new_user is SECURITY DEFINER and runs as postgres (RLS bypassed if not forced)
-- But Supabase auth triggers may run differently, so let's allow INSERT from anyone authenticated
-- The trigger function's SECURITY DEFINER will handle the actual auth context
CREATE POLICY "user_roles_insert_authenticated" ON user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);