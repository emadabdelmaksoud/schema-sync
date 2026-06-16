-- Fix product_units INSERT policy to allow trigger to work
-- The trigger function is SECURITY DEFINER but RLS is still enforced
-- We need to allow product_units insert when:
-- 1. User is authenticated AND (admin OR product owner)
-- 2. OR the insert is from a SECURITY DEFINER trigger (which sets created_by = auth.uid())

-- First, drop the restrictive policy
DROP POLICY IF EXISTS product_units_insert_admin_or_owner ON product_units;

-- Create a more permissive policy for INSERT that allows:
-- 1. Authenticated users (they must own the product they're adding units to)
-- 2. Or users with admin role
-- But most importantly, when called from the AFTER INSERT trigger on products,
-- the product is owned by auth.uid() so this should work
CREATE POLICY "product_units_insert_authenticated" ON product_units
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if user is admin
    has_role(auth.uid(), 'admin'::app_role)
    -- Or if user owns the product (covers trigger case where created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_units.product_id
      AND p.created_by = auth.uid()
    )
    -- Or if the product exists and has no owner (created_by is null)
    -- This handles the case where the trigger runs before created_by is set
    OR EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_units.product_id
      AND p.created_by IS NULL
    )
  );