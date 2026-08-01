import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSaleDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor, dto.branchId);

    // Load all referenced products in one query.
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      include: { brand: { select: { name: true } } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products do not exist');
    }

    const items = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = new Prisma.Decimal(product.sellingPrice);
      const subTotal = unitPrice.mul(item.quantity);
      return {
        productId: product.id,
        name: product.name,
        brandName: product.brand.name,
        quantity: item.quantity,
        unitPrice,
        subTotal,
      };
    });

    const total = items.reduce(
      (sum, i) => sum.add(i.subTotal),
      new Prisma.Decimal(0),
    );

    const sale = await this.prisma.sale.create({
      data: {
        branchId,
        staffId: actor.userId,
        customerName: dto.customerName?.trim() || null,
        paymentMethod: dto.paymentMethod,
        status: SaleStatus.PENDING,
        total,
        items: { create: items },
      },
      include: this.includeFull(),
    });

    await this.audit(actor.userId, 'SALE_CREATED', sale.id, {
      number: sale.number,
      total: total.toString(),
    });

    return this.serialize(sale);
  }

  async findRecords(query: QuerySaleDto, actor: RequestUser) {
    return this.list(query, actor, SaleStatus.APPROVED);
  }

  async findPending(query: QuerySaleDto, actor: RequestUser) {
    return this.list(query, actor, SaleStatus.PENDING);
  }

  private async list(
    query: QuerySaleDto,
    actor: RequestUser,
    status: SaleStatus,
  ) {
    const { page = 1, limit = 20, search, branchId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = { status };

    // Staff are scoped to their own branch.
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      where.branchId = me?.branchId ?? '00000000-0000-0000-0000-000000000000';
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { items: { some: { name: { contains: search, mode: 'insensitive' } } } },
        { items: { some: { brandName: { contains: search, mode: 'insensitive' } } } },
        { staff: { firstName: { contains: search, mode: 'insensitive' } } },
        { staff: { lastName: { contains: search, mode: 'insensitive' } } },
        { customerName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, sales] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: this.includeFull(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Summary across the whole filtered set (not just current page).
    const grouped = await this.prisma.sale.groupBy({
      by: ['paymentMethod'],
      where,
      _sum: { total: true },
    });
    const cash = grouped.find((g) => g.paymentMethod === 'Cash')?._sum.total;
    const gcash = grouped.find((g) => g.paymentMethod === 'Gcash')?._sum.total;
    const summary = {
      cash: Number(cash ?? 0),
      gcash: Number(gcash ?? 0),
      total: Number(cash ?? 0) + Number(gcash ?? 0),
      count: total,
    };

    return {
      data: sales.map((s) => this.serialize(s)),
      pagination: this.paginate(page, limit, total),
      summary,
    };
  }

  async findOne(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: this.includeFull(),
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      if (!me?.branchId || sale.branchId !== me.branchId) {
        throw new NotFoundException('Sale not found');
      }
    }
    return this.serialize(sale);
  }

  /**
   * Approve a pending sale: validates stock, deducts inventory at the sale's
   * branch, and marks the sale APPROVED. Runs in a transaction.
   */
  async approve(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException(`Sale is already ${sale.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the sale: only one concurrent approve() call can win
      // this conditional update, so a double-click or two admins approving at
      // once can't both pass the earlier PENDING check and both deduct stock.
      const claim = await tx.sale.updateMany({
        where: { id, status: SaleStatus.PENDING },
        data: {
          status: SaleStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Sale is already approved or declined');
      }

      for (const item of sale.items) {
        if (!item.productId) continue;
        const inv = await tx.inventory.findUnique({
          where: {
            productId_branchId: {
              productId: item.productId,
              branchId: sale.branchId,
            },
          },
        });
        const available = inv?.quantity ?? 0;
        if (available < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${item.name}" (need ${item.quantity}, have ${available})`,
          );
        }
      }

      for (const item of sale.items) {
        if (!item.productId) continue;
        await tx.inventory.update({
          where: {
            productId_branchId: {
              productId: item.productId,
              branchId: sale.branchId,
            },
          },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      const updated = await tx.sale.findUnique({
        where: { id },
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_APPROVED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });

      return this.serialize(updated!);
    });
  }

  /**
   * Edit a PENDING sale. Replaces line items (with fresh price snapshots) when
   * `items` is provided, and recomputes the total. Approved/declined sales are
   * immutable. Staff may only edit their own sales.
   */
  async update(id: string, dto: UpdateSaleDto, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException('Only pending sales can be edited');
    }
    if (actor.role === 'Staff' && sale.staffId !== actor.userId) {
      throw new ForbiddenException('You can only edit your own sales');
    }

    const data: Prisma.SaleUpdateInput = {};
    if (dto.customerName !== undefined) {
      data.customerName = dto.customerName?.trim() || null;
    }
    if (dto.paymentMethod !== undefined) {
      data.paymentMethod = dto.paymentMethod;
    }

    if (dto.items?.length) {
      const productIds = [...new Set(dto.items.map((i) => i.productId))];
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        include: { brand: { select: { name: true } } },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more products do not exist');
      }
      const productMap = new Map(products.map((p) => [p.id, p]));

      const newItems = dto.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const unitPrice = new Prisma.Decimal(product.sellingPrice);
        return {
          productId: product.id,
          name: product.name,
          brandName: product.brand.name,
          quantity: item.quantity,
          unitPrice,
          subTotal: unitPrice.mul(item.quantity),
        };
      });
      data.total = newItems.reduce(
        (sum, i) => sum.add(i.subTotal),
        new Prisma.Decimal(0),
      );
      // Replace items wholesale.
      data.items = { deleteMany: {}, create: newItems };
    }

    const updated = await this.prisma.sale.update({
      where: { id },
      data,
      include: this.includeFull(),
    });

    await this.audit(actor.userId, 'SALE_UPDATED', id, {
      number: sale.number,
    });

    return this.serialize(updated);
  }

  async decline(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException(`Sale is already ${sale.status.toLowerCase()}`);
    }

    const updated = await this.prisma.sale.update({
      where: { id },
      data: {
        status: SaleStatus.DECLINED,
        decidedById: actor.userId,
        decidedAt: new Date(),
      },
      include: this.includeFull(),
    });

    await this.audit(actor.userId, 'SALE_DECLINED', id, { number: sale.number });

    return this.serialize(updated);
  }

  async remove(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status === SaleStatus.APPROVED) {
      throw new BadRequestException('Approved sales cannot be deleted');
    }
    if (actor.role === 'Staff' && sale.staffId !== actor.userId) {
      throw new ForbiddenException('You can only delete your own sales');
    }

    await this.prisma.sale.delete({ where: { id } });
    await this.audit(actor.userId, 'SALE_DELETED', id, { number: sale.number });

    return { message: 'Sale deleted successfully' };
  }

  private async resolveBranchForActor(actor: RequestUser, branchId?: string) {
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      if (!me?.branchId) {
        throw new BadRequestException(
          'Your account is not assigned to a branch. Ask an admin to assign one.',
        );
      }
      return me.branchId;
    }

    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branchId;
  }

  private includeFull() {
    return {
      branch: { select: { id: true, name: true } },
      staff: { select: { id: true, firstName: true, lastName: true, email: true } },
      items: true,
    } satisfies Prisma.SaleInclude;
  }

  private serialize(sale: any) {
    return {
      id: sale.id,
      number: sale.number,
      customerName: sale.customerName,
      branch: sale.branch
        ? { id: sale.branch.id, name: sale.branch.name }
        : null,
      staff: sale.staff
        ? {
            id: sale.staff.id,
            name: `${sale.staff.firstName} ${sale.staff.lastName}`.trim(),
            email: sale.staff.email,
          }
        : null,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      total: Number(sale.total),
      items: (sale.items ?? []).map((i: any) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        brandName: i.brandName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        subTotal: Number(i.subTotal),
      })),
      createdAt: sale.createdAt,
      decidedAt: sale.decidedAt,
    };
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

  private audit(userId: string, action: string, entityId: string, newValues: any) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'Sale',
        entityId,
        newValues: newValues ?? undefined,
      },
    });
  }
}
