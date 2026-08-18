-- CreateTable: product_variants (flavors)
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "selling_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- Add variant_id to inventory (nullable for backward compat)
ALTER TABLE "inventory" ADD COLUMN "variant_id" UUID;

-- Drop old unique constraint and add new one that includes variant_id
ALTER TABLE "inventory" DROP CONSTRAINT IF EXISTS "inventory_product_id_branch_id_key";
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_variant_id_branch_id_key" UNIQUE ("product_id", "variant_id", "branch_id");

-- Add variant_id and variant_name to sale_items
ALTER TABLE "sale_items" ADD COLUMN "variant_id" UUID;
ALTER TABLE "sale_items" ADD COLUMN "variant_name" VARCHAR(100);

-- Add variant_id and variant_name to disposals
ALTER TABLE "disposals" ADD COLUMN "variant_id" UUID;
ALTER TABLE "disposals" ADD COLUMN "variant_name" VARCHAR(100);

-- Add variant_id to stock_movements
ALTER TABLE "stock_movements" ADD COLUMN "variant_id" UUID;

-- CreateIndexes
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");
CREATE INDEX "product_variants_is_active_idx" ON "product_variants"("is_active");
CREATE INDEX "inventory_variant_id_idx" ON "inventory"("variant_id");
CREATE INDEX "sale_items_variant_id_idx" ON "sale_items"("variant_id");
CREATE INDEX "disposals_variant_id_idx" ON "disposals"("variant_id");
CREATE INDEX "stock_movements_variant_id_idx" ON "stock_movements"("variant_id");

-- AddForeignKeys
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
