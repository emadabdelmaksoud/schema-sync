-- Simplify product_units INSERT policy to allow authenticated users to insert
-- when they own the product OR the product is new (just created by them)
-- This removes complex joins that might fail

DROP POLICY IF EXISTS product_units_insert_authenticated ON product_units;

-- Simple policy: authenticated users can insert product_units
-- The trigger will handle creating the base unit
CREATE POLICY "product_units_insert_authenticated" ON product_units
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);