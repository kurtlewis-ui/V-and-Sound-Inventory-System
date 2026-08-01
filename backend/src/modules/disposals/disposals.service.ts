import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, DisposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDisposalDto } from './dto/create-disposal.dto';
import { QueryDisposalDto } from './dto/query-disposal.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@Injectable()
export class DisposalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Request a disposal. It starts as PENDING and does NOT change stock yet —
   * an Admin approves or declines it. Stock is only deducted on approval.
   */
  async create(dto: CreateDisposalDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor, dto.branchId);

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      include: { brand: { select: { name: true } } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const unitPrice = new Prisma.Decimal(product.sellingPrice);
    const value = unitPrice.mul(dto.quantity);

    const disposal = await this.prisma.disposal.create({
      data: {
        branchId,
        productId: product.id,
        productName: product.name,
        brandName: product.brand.name,
        quantity: dto.quantity,
        unitPrice,
        value,
        reason: dto.reason?.trim() || null,
        status: DisposalStatus.PENDING,
        createdById: actor.userId,
      },
      include: this.includeFull(),
    });

    await this.audit(actor.userId, 'DISPOSAL_REQUESTED', disposal.id, {
      product: product.name,
      quantity: dto.quantity,
    });

    return this.serialize(disposal);
  }

  /** Approve a pending disposal: validates + deducts stock at the branch. */
  async approve(id: string, actor: RequestUser) {
    const disposal = await this.prisma.disposal.findUnique({ where: { id } });
    if (!disposal) {
      throw new NotFoundException('Disposal not found');
    }
    if (disposal.status !== DisposalStatus.PENDING) {
      throw new BadRequestException(`Disposal is already ${disposal.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the disposal so concurrent approve() calls can't
      // both pass the earlier PENDING check and both deduct stock.
      const claim = await tx.disposal.updateMany({
        where: { id, status: DisposalStatus.PENDING },
        data: {
          status: DisposalStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Disposal is already approved or declined');
      }

      if (disposal.productId) {
        // Single atomic conditional UPDATE (quantity >= needed) instead of a
        // separate read + decrement — see sales.service.ts's approve() for
        // why a plain read-then-decrement can be fooled by a concurrent
        // approval (e.g. another disposal or sale) on the same product.
        const result = await tx.inventory.updateMany({
          where: {
            productId: disposal.productId,
            branchId: disposal.branchId,
            quantity: { gte: disposal.quantity },
          },
          data: { quantity: { decrement: disposal.quantity } },
        });
        if (result.count === 0) {
          const inv = await tx.inventory.findUnique({
            where: {
              productId_branchId: { productId: disposal.productId, branchId: disposal.branchId },
            },
          });
          throw new BadRequestException(
            `Insufficient stock to dispose (need ${disposal.quantity}, have ${inv?.quantity ?? 0})`,
          );
        }
      }

      const updated = await tx.disposal.findUnique({
        where: { id },
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'DISPOSAL_APPROVED',
          entityType: 'Disposal',
          entityId: id,
          newValues: { product: disposal.productName, quantity: disposal.quantity },
        },
      });

      return this.serialize(updated!);
    });
  }

  /** Decline a pending disposal (no stock change). */
  async decline(id: string, actor: RequestUser) {
    const disposal = await this.prisma.disposal.findUnique({ where: { id } });
    if (!disposal) {
      throw new NotFoundException('Disposal not found');
    }
    if (disposal.status !== DisposalStatus.PENDING) {
      throw new BadRequestException(`Disposal is already ${disposal.status.toLowerCase()}`);
    }

    const updated = await this.prisma.disposal.update({
      where: { id },
      data: {
        status: DisposalStatus.DECLINED,
        decidedById: actor.userId,
        decidedAt: new Date(),
      },
      include: this.includeFull(),
    });

    await this.audit(actor.userId, 'DISPOSAL_DECLINED', id, {
      product: disposal.productName,
    });

    return this.serialize(updated);
  }

  async findAll(query: QueryDisposalDto, actor: RequestUser, status?: DisposalStatus) {
    const { page = 1, limit = 50, search, branchId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DisposalWhereInput = {};
    if (status) where.status = status;

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
        { productName: { contains: search, mode: 'insensitive' } },
        { brandName: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, disposals, agg] = await Promise.all([
      this.prisma.disposal.count({ where }),
      this.prisma.disposal.findMany({
        where,
        include: this.includeFull(),
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.disposal.aggregate({ where, _sum: { value: true, quantity: true } }),
    ]);

    return {
      data: disposals.map((d) => this.serialize(d)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      summary: {
        totalValue: Number(agg._sum.value ?? 0),
        totalQuantity: agg._sum.quantity ?? 0,
        count: total,
      },
    };
  }

  private async resolveBranchForActor(actor: RequestUser, branchId?: string) {
    if (actor.role === 'Staff') {
      const me = await this.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { branchId: true },
      });
      if (!me?.branchId) {
        throw new BadRequestException('Your account is not assigned to a branch.');
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
      product: { select: { id: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
    } satisfies Prisma.DisposalInclude;
  }

  private serialize(d: any) {
    return {
      id: d.id,
      branch: d.branch ? { id: d.branch.id, name: d.branch.name } : null,
      productId: d.productId,
      name: d.productName,
      brandName: d.brandName,
      quantity: d.quantity,
      unitPrice: Number(d.unitPrice),
      value: Number(d.value),
      reason: d.reason,
      status: d.status,
      createdBy: d.createdBy
        ? `${d.createdBy.firstName} ${d.createdBy.lastName}`.trim()
        : 'System',
      decidedBy: d.decidedBy
        ? `${d.decidedBy.firstName} ${d.decidedBy.lastName}`.trim()
        : null,
      decidedAt: d.decidedAt,
      createdAt: d.createdAt,
    };
  }

  private audit(userId: string, action: string, entityId: string, newValues: any) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType: 'Disposal',
        entityId,
        newValues: newValues ?? undefined,
      },
    });
  }
}
