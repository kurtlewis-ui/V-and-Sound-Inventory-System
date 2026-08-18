-- Add variant_type column to products (none / flavor / color)
ALTER TABLE "products" ADD COLUMN "variant_type" VARCHAR(10) NOT NULL DEFAULT 'none';

-- Set existing products that already have variants to 'flavor' type
UPDATE "products" SET "variant_type" = 'flavor' 
WHERE "id" IN (SELECT DISTINCT "product_id" FROM "product_variants" WHERE "is_active" = true);
