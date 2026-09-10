-- Per-branch product pricing + manual product sort order.
--
-- 1. products.sort_order: manual display order for the products list (lower =
--    higher up). Admins/Owners can drag rows to reorder; defaults to 0.
-- 2. inventory.selling_price: branch-specific selling price for the product.
--    NULL means "use the product's default selling_price". Prices are
--    product-level (flavors/colors share the product's price), so the value is
--    carried on the variant_id = NULL inventory row for each branch.

ALTER TABLE "products" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "products_sort_order_idx" ON "products"("sort_order");

ALTER TABLE "inventory" ADD COLUMN "selling_price" DECIMAL(10,2);

-- Seed sort_order from current alphabetical order so the initial list order is
-- stable and matches what users see today (name asc). Uses a window function
-- over non-archived products.
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY name ASC) - 1) AS rn
  FROM "products"
  WHERE "deleted_at" IS NULL
)
UPDATE "products" p
SET "sort_order" = ordered.rn
FROM ordered
WHERE p.id = ordered.id;
