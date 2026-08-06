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
import { slugify } from '../../common/utils/string.util';

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
        slug: slugify(dto.name),
        image: dto.image?.trim() || null,
        brandId: dto.brandId,
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

  async findAll(query: QueryProductDto) {
    const { page = 1, limit = 20, search, brandId, branchId } = query;
    const skip = (page - 1) * limit;

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
      data: products.map((p) => this.serialize(p)),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findArchived(query: QueryProductDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

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
      data: products.map((p) => this.serialize(p)),
      pagination: this.paginate(page, limit, total),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: this.includeFull(),
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.serialize(product);
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
      data.slug = slugify(dto.name);
    }
    if (dto.image !== undefined) data.image = dto.image?.trim() || null;
    if (dto.brandId !== undefined) data.brandId = dto.brandId;
    if (dto.sellingPrice !== undefined) data.sellingPrice = dto.sellingPrice;
    if (dto.quantityAlert !== undefined) data.quantityAlert = dto.quantityAlert;

    await this.prisma.product.update({ where: { id }, data });

    // Upsert per-branch quantities when provided, and log stock movements.
    if (dto.quantities?.length) {
      for (const q of dto.quantities) {
        // Get current quantity before update
        const currentInv = await this.prisma.inventory.findUnique({
          where: { productId_branchId: { productId: id, branchId: q.branchId } },
        });
        const oldQty = currentInv?.quantity ?? 0;
        const newQty = q.quantity;
        const diff = newQty - oldQty;

        await this.prisma.inventory.upsert({
          where: { productId_branchId: { productId: id, branchId: q.branchId } },
          create: { productId: id, branchId: q.branchId, quantity: q.quantity },
          update: { quantity: q.quantity },
        });

        // Log ADJUSTMENT if quantity actually changed
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

  async restore(id: string, restoredBy: string) {
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

    return this.findOne(id);
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
          data: { name: brandName, slug: slugify(brandName) },
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
          const currentInv = await this.prisma.inventory.findUnique({
            where: { productId_branchId: { productId: existing.id, branchId: inv.branchId } },
          });
          const oldQty = currentInv?.quantity ?? 0;
          await this.prisma.inventory.upsert({
            where: { productId_branchId: { productId: existing.id, branchId: inv.branchId } },
            create: { productId: existing.id, branchId: inv.branchId, quantity: inv.quantity },
            update: { quantity: inv.quantity },
          });
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
            slug: slugify(name),
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
   * Add stock to products at branches. Each item adds `quantity` to the current
   * inventory (creating the inventory row if needed). Products/branches can be
   * referenced by id or by name (name is used for CSV-style restocks).
   */
  async restock(items: RestockItemDto[], userId: string) {
    let updated = 0;
    const warnings: string[] = [];

    for (const [index, item] of items.entries()) {
      // Resolve product.
      let product = item.productId
        ? await this.prisma.product.findFirst({ where: { id: item.productId, deletedAt: null } })
        : item.productName
          ? await this.prisma.product.findFirst({
              where: { name: { equals: item.productName.trim(), mode: 'insensitive' }, deletedAt: null },
            })
          : null;
      if (!product) {
        warnings.push(`Row ${index + 1}: product not found (${item.productName ?? item.productId}) — skipped`);
        continue;
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

      await this.prisma.inventory.upsert({
        where: { productId_branchId: { productId: product.id, branchId: branch.id } },
        create: { productId: product.id, branchId: branch.id, quantity: Math.max(0, item.quantity) },
        update: { quantity: { increment: item.quantity } },
      });

      // Log the stock movement
      const inv = await this.prisma.inventory.findUnique({
        where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      });
      await this.prisma.stockMovement.create({
        data: {
          productId: product.id,
          branchId: branch.id,
          userId: userId,
          type: 'RESTOCK',
          quantityChange: item.quantity,
          quantityAfter: inv?.quantity ?? item.quantity,
          description: 'Restocked product.',
        },
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
      inventory: {
        where: branchId ? { branchId } : undefined,
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
    const totalQuantity = quantities.reduce(
      (sum: number, q: any) => sum + q.quantity,
      0,
    );

    const result: any = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      brand: product.brand
        ? { id: product.brand.id, name: product.brand.name, slug: product.brand.slug }
        : null,
      sellingPrice: Number(product.sellingPrice),
      quantityAlert: product.quantityAlert,
      isActive: product.isActive,
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
}
