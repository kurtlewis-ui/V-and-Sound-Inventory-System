import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, BranchQuantityDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ImportProductRowDto } from './dto/import-products.dto';
import { RestockItemDto } from './dto/restock.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { slugify, uniqueSlug } from '../../common/utils/string.util';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto, createdBy: string) {
    const brand = await this.prisma.brand.findFirst({
      where: { id: dto.brandId, deletedAt: null },
    });
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    await this.assertBranchesExist(dto.quantities);

    const product = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        slug: uniqueSlug(dto.name),
        image: dto.image?.trim() || null,
        brandId: dto.brandId,
        variantType: dto.variantType ?? 'none',
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice ?? 0,
        quantityAlert: dto.quantityAlert ?? 0,
        inventory: dto.quantities?.length
          ? {
              create: dto.quantities.map((q) => ({
                branchId: q.branchId,
                quantity: q.quantity,
              })),
            }
          : undefined,
      },
      include: this.includeFull(),
    });

    // Log stock movements for initial quantities
    if (dto.quantities?.length) {
      for (const q of dto.quantities) {
        if (q.quantity > 0) {
          await this.prisma.stockMovement.create({
            data: {
              productId: product.id,
              branchId: q.branchId,
              userId: createdBy,
              type: 'RESTOCK',
              quantityChange: q.quantity,
              quantityAfter: q.quantity,
              description: 'Initial stock on product creation.',
            },
          });
        }
      }
    }

    await this.audit(createdBy, 'PRODUCT_CREATED', product.id, null, {
      name: product.name,
      brand: brand.name,
    });

    return this.serialize(product);
  }

  async findAll(query: QueryProductDto, role?: string) {
    const { page = 1, limit = 20, search, brandId, branchId } = query;
    const skip = (page - 1) * limit;
    const includeOwnerFields = role === 'Owner' || role === 'Admin';

    const where: any = { deletedAt: null };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (brandId) {
      where.brandId = brandId;
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: this.includeFull(branchId),
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: products.map((p) => this.serialize(p, includeOwnerFields)),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findArchived(query: QueryProductDto, role?: string) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;
    const includeOwnerFields = role === 'Owner' || role === 'Admin';

    const where: any = { deletedAt: { not: null } };
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: this.includeFull(),
        orderBy: { deletedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: products.map((p) => this.serialize(p, includeOwnerFields)),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findOne(id: string, role?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: this.includeFull(),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const includeOwnerFields = role === 'Owner' || role === 'Admin';
    return this.serialize(product, includeOwnerFields);
  }

  async update(id: string, dto: UpdateProductDto, updatedBy: string) {
    const current = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) {
      throw new NotFoundException('Product not found');
    }

    if (dto.brandId) {
      const brand = await this.prisma.brand.findFirst({
        where: { id: dto.brandId, deletedAt: null },
      });
      if (!brand) {
        throw new NotFoundException('Brand not found');
      }
    }

    await this.assertBranchesExist(dto.quantities);

    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      data.slug = uniqueSlug(dto.name);
    }
    if (dto.image !== undefined) data.image = dto.image?.trim() || null;
    if (dto.brandId !== undefined) data.brandId = dto.brandId;
    if ((dto as any).variantType !== undefined) data.variantType = (dto as any).variantType;
    if (dto.sellingPrice !== undefined) data.sellingPrice = dto.sellingPrice;
    if (dto.costPrice !== undefined) data.costPrice = dto.costPrice;
    if (dto.quantityAlert !== undefined) data.quantityAlert = dto.quantityAlert;

    await this.prisma.product.update({ where: { id }, data });

    // Upsert per-branch quantities when provided, and log stock movements.
    // - Simple products (no variantId): upsert to `inventory` table
    // - Variant products (has variantId): upsert to `variant_inventory` table
    //   using standard Prisma upsert (clean non-nullable unique constraint)
    if (dto.quantities?.length) {
      for (const q of dto.quantities) {
        const variantId = q.variantId || null;
        const newQty = q.quantity;

        if (variantId) {
          // --- VARIANT PRODUCT: use variant_inventory table ---
          const existing = await this.prisma.variantInventory.findUnique({
            where: { variantId_branchId: { variantId, branchId: q.branchId } },
          });
          const oldQty = existing?.quantity ?? 0;

          await this.prisma.variantInventory.upsert({
            where: { variantId_branchId: { variantId, branchId: q.branchId } },
            update: { quantity: newQty },
            create: { variantId, branchId: q.branchId, quantity: newQty },
          });

          // Rename variant if variantName is provided and different
          if (q.variantName) {
            const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
            if (variant && variant.name !== q.variantName.trim()) {
              await this.prisma.productVariant.update({
                where: { id: variantId },
                data: { name: q.variantName.trim() },
              });
            }
          }

          // Log ADJUSTMENT if quantity actually changed
          const diff = newQty - oldQty;
          if (diff !== 0) {
            await this.prisma.stockMovement.create({
              data: {
                productId: id,
                variantId,
                branchId: q.branchId,
                userId: updatedBy,
                type: 'ADJUSTMENT',
                quantityChange: diff,
                quantityAfter: newQty,
                description: 'Updated quantity.',
              },
            });
          }
        } else {
          // --- SIMPLE PRODUCT: use inventory table (existing logic) ---
          const existing = await this.prisma.$queryRawUnsafe<{ id: string; quantity: number }[]>(
            `SELECT id, quantity FROM inventory WHERE product_id = $1::uuid AND variant_id IS NULL AND branch_id = $2::uuid LIMIT 1`,
            id, q.branchId,
          );
          const oldQty = existing.length > 0 ? Number(existing[0].quantity) : 0;

          if (existing.length > 0) {
            await this.prisma.$executeRawUnsafe(
              `UPDATE inventory SET quantity = $1::int, updated_at = NOW() WHERE id = $2::uuid`,
              newQty, existing[0].id,
            );
          } else {
            await this.prisma.$executeRawUnsafe(
              `INSERT INTO inventory (id, product_id, variant_id, branch_id, quantity, updated_at)
               VALUES (gen_random_uuid(), $1::uuid, NULL, $2::uuid, $3::int, NOW())`,
              id, q.branchId, newQty,
            );
          }

          // Log ADJUSTMENT if quantity actually changed
          const diff = newQty - oldQty;
          if (diff !== 0) {
            await this.prisma.stockMovement.create({
              data: {
                productId: id,
                branchId: q.branchId,
                userId: updatedBy,
                type: 'ADJUSTMENT',
                quantityChange: diff,
                quantityAfter: newQty,
                description: 'Updated quantity.',
              },
            });
          }
        }
      }
    }

    const updated = await this.prisma.product.findUnique({
      where: { id },
      include: this.includeFull(),
    });

    await this.audit(
      updatedBy,
      'PRODUCT_UPDATED',
      id,
      { name: current.name },
      data,
    );

    return this.serialize(updated!);
  }

  async remove(id: string, deletedBy: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit(
      deletedBy,
      'PRODUCT_ARCHIVED',
      id,
      { name: product.name },
      null,
    );

    return { message: 'Product archived successfully' };
  }

  async permanentDelete(id: string, deletedBy: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: { not: null } },
    });
    if (!product) {
      throw new NotFoundException('Archived product not found. Only archived items can be permanently deleted.');
    }

    // Delete all related data
    await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { productId: id } });
      await tx.saleItem.deleteMany({ where: { productId: id } });
      await tx.disposal.deleteMany({ where: { productId: id } });
      await tx.inventory.deleteMany({ where: { productId: id } });
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    await this.audit(deletedBy, 'PRODUCT_PERMANENTLY_DELETED', id, { name: product.name }, null);

    return { message: 'Product permanently deleted' };
  }

  async restore(id: string, restoredBy: string, role?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { brand: true },
    });
    if (!product) {
      throw new NotFoundException('Archived product not found');
    }
    if (product.brand.deletedAt) {
      throw new BadRequestException(
        'Cannot restore: the product brand is archived. Restore the brand first.',
      );
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
    });

    await this.audit(restoredBy, 'PRODUCT_RESTORED', id, null, {
      name: product.name,
    });

    return this.findOne(id, role);
  }

  /**
   * Bulk import/upsert products from parsed rows (e.g. a CSV). Brands are
   * matched by name and auto-created when missing. Per-branch quantities are
   * matched to existing shops by name (unknown shop names are reported).
   */
  async importProducts(rows: ImportProductRowDto[], userId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const branchByName = new Map(
      branches.map((b) => [b.name.toLowerCase(), b.id]),
    );

    let created = 0;
    let updated = 0;
    const warnings: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = row.name?.trim();
      const brandName = row.brand?.trim();
      if (!name || !brandName) {
        warnings.push(`Row ${index + 1}: missing name or brand — skipped`);
        continue;
      }

      // Resolve or create the brand.
      let brand = await this.prisma.brand.findFirst({
        where: { name: { equals: brandName, mode: 'insensitive' }, deletedAt: null },
      });
      if (!brand) {
        brand = await this.prisma.brand.create({
          data: { name: brandName, slug: uniqueSlug(brandName) },
        });
      }

      // Build inventory rows from matched branches.
      const invRows: { branchId: string; quantity: number }[] = [];
      for (const q of row.quantities ?? []) {
        const branchId = branchByName.get(q.branchName.trim().toLowerCase());
        if (!branchId) {
          warnings.push(`Row ${index + 1}: unknown shop "${q.branchName}" — skipped`);
          continue;
        }
        invRows.push({ branchId, quantity: q.quantity });
      }

      const existing = await this.prisma.product.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
      });

      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            brandId: brand.id,
            sellingPrice: row.sellingPrice,
            quantityAlert: row.quantityAlert ?? 0,
          },
        });
        for (const inv of invRows) {
          const currentInv = await this.prisma.inventory.findFirst({ where: { productId: existing.id, variantId: null, branchId: inv.branchId },
          });
          const oldQty = currentInv?.quantity ?? 0;
          if (currentInv) {
            await this.prisma.inventory.update({
              where: { id: currentInv.id },
              data: { quantity: inv.quantity },
            });
          } else {
            await this.prisma.inventory.create({
              data: { productId: existing.id, branchId: inv.branchId, quantity: inv.quantity },
            });
          }
          const diff = inv.quantity - oldQty;
          if (diff !== 0) {
            await this.prisma.stockMovement.create({
              data: {
                productId: existing.id,
                branchId: inv.branchId,
                userId,
                type: 'ADJUSTMENT',
                quantityChange: diff,
                quantityAfter: inv.quantity,
                description: 'Imported product quantity update.',
              },
            });
          }
        }
        updated++;
      } else {
        const newProduct = await this.prisma.product.create({
          data: {
            name,
            slug: uniqueSlug(name),
            brandId: brand.id,
            sellingPrice: row.sellingPrice,
            quantityAlert: row.quantityAlert ?? 0,
            inventory: invRows.length ? { create: invRows } : undefined,
          },
        });
        // Log stock movements for newly created products
        for (const inv of invRows) {
          if (inv.quantity > 0) {
            await this.prisma.stockMovement.create({
              data: {
                productId: newProduct.id,
                branchId: inv.branchId,
                userId,
                type: 'RESTOCK',
                quantityChange: inv.quantity,
                quantityAfter: inv.quantity,
                description: 'Initial stock from import.',
              },
            });
          }
        }
        created++;
      }
    }

    await this.audit(userId, 'PRODUCTS_IMPORTED', userId, null, {
      created,
      updated,
    });

    return { created, updated, total: rows.length, warnings };
  }

  /**
   * Add stock to products (or specific flavors) at branches. Each item adds
   * `quantity` to the current inventory (creating the inventory row if needed).
   * Products/branches/variants can be referenced by id or by name.
   */
  async restock(items: RestockItemDto[], userId: string) {
    let updated = 0;
    const warnings: string[] = [];

    for (const [index, item] of items.entries()) {
      // Resolve product.
      let product = item.productId
        ? await this.prisma.product.findFirst({ where: { id: item.productId, deletedAt: null }, include: { variants: { where: { isActive: true } } } })
        : item.productName
          ? await this.prisma.product.findFirst({
              where: { name: { equals: item.productName.trim(), mode: 'insensitive' }, deletedAt: null },
              include: { variants: { where: { isActive: true } } },
            })
          : null;
      if (!product) {
        warnings.push(`Row ${index + 1}: product not found (${item.productName ?? item.productId}) — skipped`);
        continue;
      }

      // Resolve variant (optional).
      let variantId: string | null = null;
      if (item.variantId) {
        const variant = product.variants?.find((v: any) => v.id === item.variantId);
        if (!variant) {
          warnings.push(`Row ${index + 1}: flavor not found (${item.variantId}) — skipped`);
          continue;
        }
        variantId = variant.id;
      } else if (item.variantName) {
        const variant = product.variants?.find((v: any) => v.name.toLowerCase() === item.variantName!.trim().toLowerCase());
        if (!variant) {
          warnings.push(`Row ${index + 1}: flavor "${item.variantName}" not found for "${product.name}" — skipped`);
          continue;
        }
        variantId = variant.id;
      }

      // Resolve branch.
      let branch = item.branchId
        ? await this.prisma.branch.findFirst({ where: { id: item.branchId, deletedAt: null } })
        : item.branchName
          ? await this.prisma.branch.findFirst({
              where: { name: { equals: item.branchName.trim(), mode: 'insensitive' }, deletedAt: null },
            })
          : null;
      if (!branch) {
        warnings.push(`Row ${index + 1}: shop not found (${item.branchName ?? item.branchId}) — skipped`);
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        // Use findFirst + update/create instead of upsert because Prisma
        // can't handle nullable fields in compound unique key upserts.
        const existing = await tx.inventory.findFirst({
          where: { productId: product!.id, variantId: variantId ?? null, branchId: branch!.id },
        });
        if (existing) {
          await tx.inventory.update({
            where: { id: existing.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          try {
            await tx.inventory.create({
              data: { productId: product!.id, variantId, branchId: branch!.id, quantity: Math.max(0, item.quantity) },
            });
          } catch (createErr: any) {
            // Handle unique constraint violation — row was created between
            // our findFirst and this create, or variantId resolution failed.
            if (createErr?.code === 'P2002') {
              const fallback = await tx.inventory.findFirst({
                where: { productId: product!.id, variantId: variantId ?? null, branchId: branch!.id },
              });
              if (fallback) {
                await tx.inventory.update({
                  where: { id: fallback.id },
                  data: { quantity: { increment: item.quantity } },
                });
              }
            } else {
              throw createErr;
            }
          }
        }

        // Log the stock movement (read inside same transaction for accuracy)
        const inv = await tx.inventory.findFirst({ where: { productId: product!.id, variantId: variantId ?? null, branchId: branch!.id },
        });
        await tx.stockMovement.create({
          data: {
            productId: product!.id,
            variantId,
            branchId: branch!.id,
            userId: userId,
            type: 'RESTOCK',
            quantityChange: item.quantity,
            quantityAfter: inv?.quantity ?? item.quantity,
            description: 'Restocked product.',
          },
        });
      });

      updated++;
    }

    await this.audit(userId, 'PRODUCTS_RESTOCKED', userId, null, { updated });

    return { updated, total: items.length, warnings };
  }

  private async assertBranchesExist(quantities?: BranchQuantityDto[]) {
    if (!quantities?.length) return;
    const ids = [...new Set(quantities.map((q) => q.branchId))];
    const found = await this.prisma.branch.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (found !== ids.length) {
      throw new BadRequestException('One or more branches do not exist');
    }
  }

  private includeFull(branchId?: string) {
    return {
      brand: { select: { id: true, name: true, slug: true } },
      variants: {
        where: { isActive: true },
        orderBy: { name: 'asc' as const },
        include: {
          variantInventory: {
            where: branchId ? { branchId } : undefined,
            include: { branch: { select: { id: true, name: true } } },
          },
        },
      },
      inventory: {
        where: branchId ? { branchId, variantId: null } : { variantId: null },
        include: { branch: { select: { id: true, name: true } } },
      },
    };
  }

  private serialize(product: any, includeOwnerFields = false) {
    const quantities = (product.inventory ?? []).map((inv: any) => ({
      branchId: inv.branchId,
      branchName: inv.branch?.name ?? null,
      quantity: inv.quantity,
    }));
    const baseTotal = quantities.reduce(
      (sum: number, q: any) => sum + q.quantity,
      0,
    );

    const variants = (product.variants ?? []).map((v: any) => {
      // Read from variantInventory (the new separate table)
      const vQuantities = (v.variantInventory ?? []).map((inv: any) => ({
        branchId: inv.branchId,
        branchName: inv.branch?.name ?? null,
        quantity: inv.quantity,
      }));
      return {
        id: v.id,
        name: v.name,
        sellingPrice: Number(v.sellingPrice),
        quantities: vQuantities,
        totalQuantity: vQuantities.reduce((sum: number, q: any) => sum + q.quantity, 0),
        ...(includeOwnerFields ? { costPrice: Number(v.costPrice) } : {}),
      };
    });

    // totalQuantity: for variant products, sum all variant stock.
    // For simple products, use base inventory total.
    const variantTotal = variants.reduce((sum: number, v: any) => sum + v.totalQuantity, 0);
    const totalQuantity = variantTotal > 0 ? variantTotal : baseTotal;

    const result: any = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      brand: product.brand
        ? { id: product.brand.id, name: product.brand.name, slug: product.brand.slug }
        : null,
      variantType: product.variantType ?? 'none',
      sellingPrice: Number(product.sellingPrice),
      quantityAlert: product.quantityAlert,
      isActive: product.isActive,
      variants,
      quantities,
      totalQuantity,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt,
    };

    // Only include costPrice for Owner role (confidential)
    if (includeOwnerFields) {
      result.costPrice = Number(product.costPrice);
    }

    return result;
  }

  private paginate(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  private audit(
    userId: string,
    action: string,
    entityId: string,
    oldValues: any,
    newValues: any,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'Product',
        entityId,
        oldValues: oldValues ?? undefined,
        newValues: newValues ?? undefined,
      },
    });
  }

  // ===========================================================================
  // VARIANTS (Flavors)
  // ===========================================================================

  /** List all active variants for a product. */
  async findVariants(productId: string, role?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { productId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const includeOwnerFields = role === 'Owner' || role === 'Admin';
    return variants.map((v) => this.serializeVariant(v, includeOwnerFields));
  }

  /** Create a new variant (flavor) for a product. */
  async createVariant(productId: string, dto: CreateVariantDto, userId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        name: dto.name.trim(),
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice ?? 0,
      },
    });

    await this.audit(userId, 'VARIANT_CREATED', variant.id, null, {
      product: product.name,
      variant: variant.name,
    });

    return this.serializeVariant(variant, true);
  }

  /** Update a variant's name, price, or cost price. */
  async updateVariant(variantId: string, dto: UpdateVariantDto, userId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { name: true } } },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.sellingPrice !== undefined) data.sellingPrice = dto.sellingPrice;
    if (dto.costPrice !== undefined) data.costPrice = dto.costPrice;

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data,
    });

    await this.audit(userId, 'VARIANT_UPDATED', variantId, { name: variant.name }, data);

    return this.serializeVariant(updated, true);
  }

  /** Soft-delete a variant (set isActive = false). */
  async removeVariant(variantId: string, userId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { name: true } } },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isActive: false },
    });

    await this.audit(userId, 'VARIANT_ARCHIVED', variantId, { name: variant.name }, null);

    return { message: 'Variant archived successfully' };
  }

  private serializeVariant(variant: any, includeOwnerFields = false) {
    const result: any = {
      id: variant.id,
      productId: variant.productId,
      name: variant.name,
      sellingPrice: Number(variant.sellingPrice),
      isActive: variant.isActive,
      createdAt: variant.createdAt,
    };
    if (includeOwnerFields) {
      result.costPrice = Number(variant.costPrice);
    }
    return result;
  }
}
