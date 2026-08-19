-- Fix the inventory unique constraint.
-- The old constraint (product_id, branch_id) without variant_id may still
-- exist on production if the earlier migration didn't run cleanly.
-- This migration ensures only the correct 3-column constraint exists.

-- Step 1: Drop the OLD constraint (product_id, branch_id only) if it exists.
-- This is the one causing "A record with this product_id, branch_id already exists".
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_product_id_branch_id_key";

-- Step 2: Drop the new constraint too (so we can recreate it cleanly).
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_product_id_variant_id_branch_id_key";

-- Step 3: Recreate the correct constraint that includes variant_id.
-- This allows multiple rows for the same product+branch as long as variant_id differs.
-- PostgreSQL treats NULLs as distinct in unique constraints, so:
--   (product_id, NULL, branch_id) can coexist with (product_id, 'uuid', branch_id)
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_variant_id_branch_id_key" 
  UNIQUE ("product_id", "variant_id", "branch_id");
