-- CreateTable: variant_inventory
-- Separate table for per-variant per-branch stock levels.
-- Uses a simple non-nullable unique constraint (variant_id, branch_id)
-- that works reliably with standard Prisma upsert operations.
CREATE TABLE "variant_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_inventory_pkey" PRIMARY KEY ("id")
);

-- Unique constraint (no nullable columns — standard upsert works perfectly)
ALTER TABLE "variant_inventory" ADD CONSTRAINT "variant_inventory_variant_id_branch_id_key" UNIQUE ("variant_id", "branch_id");

-- Indexes
CREATE INDEX "variant_inventory_branch_id_idx" ON "variant_inventory"("branch_id");

-- Foreign keys
ALTER TABLE "variant_inventory" ADD CONSTRAINT "variant_inventory_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_inventory" ADD CONSTRAINT "variant_inventory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
