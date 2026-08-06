import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SaleStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { restoreToDraft } from './draft-restore.util';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a sale. Stock is reserved (decremented) immediately, at creation —
   * not at approval — so two pending sales for the same product can't both
   * "look valid" only to have the second approval mysteriously fail later.
   * If declined or deleted while still pending, the reservation is restored.
   */
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

    const items = this.buildSaleItems(dto.items, productMap);

    const total = items.reduce(
      (sum, i) => sum.add(i.subTotal),
      new Prisma.Decimal(0),
    );

    const sale = await this.prisma.$transaction(async (tx) => {
      await this.reserveStock(tx, branchId, items, actor.userId);
      const number = await this.nextDailyNumber(tx, branchId);

      const created = await tx.sale.create({
        data: {
          branchId,
          number,
          staffId: actor.userId,
          customerName: dto.customerName?.trim() || null,
          paymentMethod: this.rollupPaymentMethod(items),
          status: SaleStatus.PENDING,
          total,
          items: { create: items },
        },
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_CREATED',
          entityType: 'Sale',
          entityId: created.id,
          newValues: { number: created.number, total: total.toString() },
        },
      });

      return created;
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

    const [total, sales, summaryItems] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: this.includeFull(),
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      // Summary across the whole filtered set (not just current page).
      // Payment now varies per item, so this sums item-level amounts
      // (splitting Split-payment items across their buckets) rather than a
      // DB-level groupBy on the sale's single payment method.
      this.prisma.saleItem.findMany({
        where: { sale: where },
        select: { paymentMethod: true, subTotal: true, paymentSplit: true },
      }),
    ]);

    const summary = { cash: 0, gcash: 0, bankTransfer: 0, cashless: 0, total: 0, count: total };
    for (const item of summaryItems) {
      if (item.paymentMethod === 'Split' && item.paymentSplit) {
        const split = item.paymentSplit as unknown as {
          cash: number; gcash: number; bankTransfer: number; cashless: number;
        };
        summary.cash += Number(split.cash || 0);
        summary.gcash += Number(split.gcash || 0);
        summary.bankTransfer += Number(split.bankTransfer || 0);
        summary.cashless += Number(split.cashless || 0);
      } else {
        const amount = Number(item.subTotal);
        if (item.paymentMethod === 'Cash') summary.cash += amount;
        else if (item.paymentMethod === 'Gcash') summary.gcash += amount;
        else if (item.paymentMethod === 'BankTransfer') summary.bankTransfer += amount;
        else if (item.paymentMethod === 'Cashless') summary.cashless += amount;
      }
    }
    summary.total = summary.cash + summary.gcash + summary.bankTransfer + summary.cashless;

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
   * Approve a pending sale. Stock was already reserved at creation, so this
   * just flips the status — nothing to check or deduct here anymore.
   */
  async approve(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status !== SaleStatus.PENDING) {
      throw new BadRequestException(`Sale is already ${sale.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomically claim the sale: only one concurrent approve() call can win
      // this conditional update, so a double-click or two admins approving at
      // once can't both succeed.
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
   * immutable. Staff may only edit their own sales. Since stock is reserved
   * at creation, changing quantities means releasing the old reservation and
   * reserving the new one.
   */
  async update(id: string, dto: UpdateSaleDto, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
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

    let newItems: ReturnType<typeof this.buildSaleItems> | null = null;
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

      newItems = this.buildSaleItems(dto.items, productMap);
      data.total = newItems.reduce(
        (sum, i) => sum.add(i.subTotal),
        new Prisma.Decimal(0),
      );
      data.paymentMethod = this.rollupPaymentMethod(newItems);
      // Replace items wholesale.
      data.items = { deleteMany: {}, create: newItems };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (newItems) {
        await this.restoreStock(tx, sale.branchId, sale.items, actor.userId);
        await this.reserveStock(tx, sale.branchId, newItems, actor.userId);
      }

      const result = await tx.sale.update({
        where: { id },
        data,
        include: this.includeFull(),
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_UPDATED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });

      return result;
    });

    return this.serialize(updated);
  }

  async decline(id: string, actor: RequestUser) {
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
      const claim = await tx.sale.updateMany({
        where: { id, status: SaleStatus.PENDING },
        data: {
          status: SaleStatus.DECLINED,
          decidedById: actor.userId,
          decidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Sale is already approved or declined');
      }

      // Release the stock that was reserved when this sale was created.
      await this.restoreStock(tx, sale.branchId, sale.items, actor.userId);

      // Copy the declined items back into the staff's draft cart, merged
      // with whatever's already staged, so they can fix and resubmit
      // instead of re-entering everything from scratch.
      const restorable = sale.items.filter((i) => i.productId);
      if (restorable.length > 0) {
        const products = await tx.product.findMany({
          where: { id: { in: restorable.map((i) => i.productId as string) } },
          select: { id: true, image: true },
        });
        const imageMap = new Map(products.map((p) => [p.id, p.image]));
        await restoreToDraft(tx, sale.staffId, sale.branchId, {
          items: restorable.map((i) => ({
            productId: i.productId as string,
            name: i.name,
            brandName: i.brandName,
            unitPrice: Number(i.unitPrice),
            image: imageMap.get(i.productId as string) ?? null,
            quantity: i.quantity,
            discount: Number(i.discount),
            paymentMethod: i.paymentMethod,
            bankNote: i.bankNote,
            note: i.note,
            paymentSplit: i.paymentSplit,
          })),
        });
      }

      const updated = await tx.sale.findUnique({ where: { id }, include: this.includeFull() });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_DECLINED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });

      return this.serialize(updated!);
    });
  }

  async remove(id: string, actor: RequestUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (sale.status === SaleStatus.APPROVED) {
      throw new BadRequestException('Approved sales cannot be deleted');
    }
    if (actor.role === 'Staff' && sale.staffId !== actor.userId) {
      throw new ForbiddenException('You can only delete your own sales');
    }

    await this.prisma.$transaction(async (tx) => {
      // Only PENDING sales still have their reservation in effect — a
      // DECLINED sale already had its stock restored when it was declined,
      // so restoring again here would double-credit the inventory.
      if (sale.status === SaleStatus.PENDING) {
        await this.restoreStock(tx, sale.branchId, sale.items, actor.userId);
      }
      await tx.sale.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'SALE_DELETED',
          entityType: 'Sale',
          entityId: id,
          newValues: { number: sale.number },
        },
      });
    });

    return { message: 'Sale deleted successfully' };
  }

  /** Build full sale item records (with payment resolved) from DTO input. */
  private buildSaleItems(
    dtoItems: { productId: string; quantity: number; discount?: number; paymentMethod: PaymentMethod; bankNote?: string; note?: string; paymentSplit?: { cash: number; gcash: number; bankTransfer: number; cashless: number } }[],
    productMap: Map<string, { id: string; name: string; sellingPrice: Prisma.Decimal; costPrice?: Prisma.Decimal; brand: { name: string } }>,
  ) {
    return dtoItems.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = new Prisma.Decimal(product.sellingPrice);
      const costPrice = new Prisma.Decimal(product.costPrice ?? 0);
      const lineTotal = unitPrice.mul(item.quantity);
      const discount = new Prisma.Decimal(item.discount || 0);
      if (discount.gt(lineTotal)) {
        throw new BadRequestException(
          `Discount for "${product.name}" (${discount.toFixed(2)}) can't exceed its line total (${lineTotal.toFixed(2)})`,
        );
      }
      const subTotal = lineTotal.sub(discount);
      return {
        productId: product.id,
        name: product.name,
        brandName: product.brand.name,
        quantity: item.quantity,
        unitPrice,
        costPrice,
        discount,
        subTotal,
        ...this.resolveItemPayment(item, subTotal, product.name),
      };
    });
  }

  /**
   * Validate and normalize one item's payment fields. For Split, the client
   * supplies cash/gcash/bankTransfer and the remaining cashless amount is
   * always recomputed server-side as the remainder — never trusted from the
   * client — so the four buckets can't be made to disagree with subTotal.
   */
  private resolveItemPayment(
    item: { paymentMethod: PaymentMethod; bankNote?: string; note?: string; paymentSplit?: { cash: number; gcash: number; bankTransfer: number; cashless: number } },
    subTotal: Prisma.Decimal,
    label: string,
  ) {
    let paymentSplit: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;

    if (item.paymentMethod === 'Split') {
      const s = item.paymentSplit;
      if (!s) {
        throw new BadRequestException(`Split payment amounts are required for "${label}"`);
      }
      const cash = new Prisma.Decimal(s.cash || 0);
      const gcash = new Prisma.Decimal(s.gcash || 0);
      const bankTransfer = new Prisma.Decimal(s.bankTransfer || 0);
      const allocated = cash.add(gcash).add(bankTransfer);
      if (allocated.gt(subTotal)) {
        throw new BadRequestException(
          `Split payment for "${label}" adds up to more than its total (${subTotal.toFixed(2)})`,
        );
      }
      const cashless = subTotal.sub(allocated);
      paymentSplit = {
        cash: cash.toNumber(),
        gcash: gcash.toNumber(),
        bankTransfer: bankTransfer.toNumber(),
        cashless: cashless.toNumber(),
      };
    }

    const bankNote =
      item.paymentMethod === 'BankTransfer' || item.paymentMethod === 'Split'
        ? item.bankNote?.trim() || null
        : null;

    return {
      paymentMethod: item.paymentMethod,
      bankNote,
      note: item.note?.trim() || null,
      paymentSplit,
    };
  }

  /** Sale-level rollup: the shared method if every item agrees, else Mixed. */
  private rollupPaymentMethod(items: { paymentMethod: PaymentMethod }[]): PaymentMethod {
    const methods = new Set(items.map((i) => i.paymentMethod));
    return methods.size === 1 ? [...methods][0] : PaymentMethod.Mixed;
  }

  /**
   * Atomically reserve (decrement) stock for each item as a single
   * conditional UPDATE (quantity >= needed), throwing if any item can't be
   * fully reserved. A conditional UPDATE's WHERE clause is re-evaluated
   * against the current row when it acquires the lock, so — unlike a plain
   * read-then-decrement — it can't be fooled by a stale read when multiple
   * reservations for the same product happen concurrently.
   */
  private async reserveStock(
    tx: Prisma.TransactionClient,
    branchId: string,
    items: { productId: string | null; name: string; quantity: number }[],
    userId?: string,
  ) {
    for (const item of items) {
      if (!item.productId) continue;
      const result = await tx.inventory.updateMany({
        where: {
          productId: item.productId,
          branchId,
          quantity: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });
      if (result.count === 0) {
        const inv = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: item.productId, branchId } },
        });
        throw new BadRequestException(
          `Insufficient stock for "${item.name}" (need ${item.quantity}, have ${inv?.quantity ?? 0})`,
        );
      }
      // Log stock movement
      const inv = await tx.inventory.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          branchId,
          userId: userId ?? null,
          type: 'SALE',
          quantityChange: -item.quantity,
          quantityAfter: inv?.quantity ?? 0,
          description: 'Added orders.',
        },
      });
    }
  }

  /** Restore (increment) previously-reserved stock for each item. */
  private async restoreStock(
    tx: Prisma.TransactionClient,
    branchId: string,
    items: { productId: string | null; quantity: number }[],
    userId?: string,
  ) {
    for (const item of items) {
      if (!item.productId) continue;
      await tx.inventory.updateMany({
        where: { productId: item.productId, branchId },
        data: { quantity: { increment: item.quantity } },
      });
      // Log stock movement
      const inv = await tx.inventory.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          branchId,
          userId: userId ?? null,
          type: 'RETURN',
          quantityChange: item.quantity,
          quantityAfter: inv?.quantity ?? 0,
          description: 'Restored product quantity after clearing orders.',
        },
      });
    }
  }

  /**
   * Atomically claim the next sale number for this branch today. A plain
   * upsert-increment on a (branchId, date) row — concurrent creates for the
   * same branch/day serialize on the row's unique constraint, so two sales
   * can never be handed the same number, and each branch's numbering starts
   * back at 1 every day instead of sharing one global, ever-climbing count.
   */
  private async nextDailyNumber(tx: Prisma.TransactionClient, branchId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const counter = await tx.dailySaleCounter.upsert({
      where: { branchId_date: { branchId, date: today } },
      create: { branchId, date: today, count: 1 },
      update: { count: { increment: 1 } },
    });
    return counter.count;
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
      // Rollup of the items' payment methods — the shared method, or Mixed.
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
        discount: Number(i.discount ?? 0),
        subTotal: Number(i.subTotal),
        paymentMethod: i.paymentMethod,
        bankNote: i.bankNote ?? null,
        note: i.note ?? null,
        paymentSplit: i.paymentSplit ?? null,
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
}
