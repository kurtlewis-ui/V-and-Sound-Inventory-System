-- Zero out stale base-product inventory rows for products that have variants.
-- Previously, stock for variant products was incorrectly stored in the
-- base row (variant_id IS NULL) instead of per-variant rows. This migration
-- cleans up those stale values so the Quantity column shows the correct
-- per-variant sum instead of a misleading leftover number.

UPDATE inventory
SET quantity = 0
WHERE variant_id IS NULL
  AND product_id IN (
    SELECT id FROM products WHERE variant_type IN ('flavor', 'color')
  );
