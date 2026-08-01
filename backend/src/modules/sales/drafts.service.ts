import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertDraftDto } from './dto/upsert-draft.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';
import { SalesService } from './sales.service';
import { DisposalsService } from '../disposals/disposals.service';
import { ExpensesService } from '../expenses/expenses.service';

@Injectable()
export class DraftsService {
  constructor(
    private prisma: PrismaService,
    private salesService: SalesService,
    private disposalsService: DisposalsService,
    private expensesService: ExpensesService,
  ) {}

  /**
   * Upsert the current staff member's draft cart (sale items, staged
   * disposals, staged expenses). Deletes the row instead of leaving a stale
   * empty draft around once every section is empty.
   */
  async upsertMine(dto: UpsertDraftDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor);
    const disposalItems = dto.disposalItems ?? [];
    const expenses = dto.expenses ?? [];

    if (dto.items.length === 0 && disposalItems.length === 0 && expenses.length === 0) {
      await this.prisma.draftOrder.deleteMany({ where: { staffId: actor.userId } });
      return { message: 'Draft cleared' };
    }

    const data = {
      branchId,
      items: dto.items as unknown as Prisma.InputJsonValue,
      disposalItems: disposalItems as unknown as Prisma.InputJsonValue,
      expenses: expenses as unknown as Prisma.InputJsonValue,
      customerName: dto.customerName?.trim() || null,
    };

    await this.prisma.draftOrder.upsert({
      where: { staffId: actor.userId },
      create: { staffId: actor.userId, ...data },
      update: data,
    });

    return { message: 'Draft saved' };
  }

  /**
   * Whether a draft still exists server-side for the current staff member.
   * Lets the staff's own device detect that an admin submitted their draft
   * on their behalf (via saveForStaff) while they still have the old items
   * sitting in local storage, so it can clear them and avoid resubmitting.
   * Also returns the current content so the device can pull down changes it
   * didn't make itself — e.g. an item a decline copied back in.
   */
  async existsForMine(actor: RequestUser) {
    const draft = await this.prisma.draftOrder.findUnique({
      where: { staffId: actor.userId },
    });
    if (!draft) {
      return { exists: false, items: [], disposalItems: [], expenses: [] };
    }
    return {
      exists: true,
      items: draft.items,
      disposalItems: draft.disposalItems,
      expenses: draft.expenses,
    };
  }

  /** Clear the current staff member's draft (e.g. on submit/logout). */
  async clearMine(actor: RequestUser) {
    await this.prisma.draftOrder.deleteMany({ where: { staffId: actor.userId } });
    return { message: 'Draft cleared' };
  }

  /** Admin/Owner view: every staff member's current draft cart. */
  async findAll(branchId?: string) {
    const drafts = await this.prisma.draftOrder.findMany({
      where: branchId ? { branchId } : undefined,
      include: {
        staff: { select: { id: true, firstName: true, lastName: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return drafts.map((d) => this.serialize(d, d.staff, d.branch));
  }

  /**
   * Admin action: submit a staff member's draft on their behalf (e.g. they
   * forgot to hit "Save Order"). Creates the same PENDING Sale/Disposal(s)/
   * Expense(s) the staff's own submit would have, attributed to that staff
   * member — not the admin who clicked the button.
   *
   * Each part (sale, each disposal item, each expense) is attempted
   * independently. If one part fails (e.g. stock ran out in the meantime),
   * whatever already succeeded stays created — it's real now — and only the
   * failed part is left behind in the draft so it isn't silently lost or
   * resubmitted as a duplicate on a retry.
   */
  async saveForStaff(staffId: string, actor: RequestUser) {
    const draft = await this.prisma.draftOrder.findUnique({ where: { staffId } });
    if (!draft) {
      throw new NotFoundException('No draft found for that staff member');
    }
    const staffUser = await this.prisma.user.findUnique({ where: { id: staffId } });
    if (!staffUser) {
      throw new NotFoundException('Staff member not found');
    }
    const staffActor: RequestUser = { userId: staffId, email: staffUser.email, role: 'Staff' };

    const items = Array.isArray(draft.items) ? (draft.items as any[]) : [];
    const disposalItems = Array.isArray(draft.disposalItems) ? (draft.disposalItems as any[]) : [];
    const expenseEntries = Array.isArray(draft.expenses) ? (draft.expenses as any[]) : [];

    const errors: string[] = [];
    let sale: unknown = null;
    let remainingItems = items;
    if (items.length > 0) {
      try {
        sale = await this.salesService.create(
          {
            branchId: draft.branchId,
            customerName: draft.customerName ?? undefined,
            items: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              discount: i.discount ?? undefined,
              paymentMethod: i.paymentMethod,
              bankNote: i.bankNote ?? undefined,
              note: i.note ?? undefined,
              paymentSplit: i.paymentSplit ?? undefined,
            })),
          },
          staffActor,
        );
        remainingItems = [];
      } catch (e: any) {
        errors.push(`Sale: ${e?.message ?? 'failed to save'}`);
      }
    }

    const disposals: unknown[] = [];
    const remainingDisposals: any[] = [];
    for (const d of disposalItems) {
      try {
        disposals.push(
          await this.disposalsService.create(
            { branchId: draft.branchId, productId: d.productId, quantity: d.quantity, reason: d.reason },
            staffActor,
          ),
        );
      } catch (e: any) {
        errors.push(`Dispose ${d.name ?? d.productId}: ${e?.message ?? 'failed'}`);
        remainingDisposals.push(d);
      }
    }

    const expenses: unknown[] = [];
    const remainingExpenses: any[] = [];
    for (const ex of expenseEntries) {
      try {
        expenses.push(
          await this.expensesService.create(
            { branchId: draft.branchId, amount: ex.amount, note: ex.note },
            staffActor,
          ),
        );
      } catch (e: any) {
        errors.push(`Expense "${ex.note}": ${e?.message ?? 'failed'}`);
        remainingExpenses.push(ex);
      }
    }

    if (remainingItems.length === 0 && remainingDisposals.length === 0 && remainingExpenses.length === 0) {
      await this.prisma.draftOrder.delete({ where: { staffId } });
    } else {
      await this.prisma.draftOrder.update({
        where: { staffId },
        data: {
          items: remainingItems as unknown as Prisma.InputJsonValue,
          disposalItems: remainingDisposals as unknown as Prisma.InputJsonValue,
          expenses: remainingExpenses as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: 'DRAFT_SAVED_BY_ADMIN',
        entityType: 'DraftOrder',
        entityId: draft.id,
        newValues: {
          staffId,
          saleCreated: !!sale,
          disposalsCreated: disposals.length,
          expensesCreated: expenses.length,
          errors,
        },
      },
    });

    if (errors.length > 0 && !sale && disposals.length === 0 && expenses.length === 0) {
      throw new BadRequestException(errors.join('; '));
    }

    return { sale, disposals, expenses, errors };
  }

  private async resolveBranchForActor(actor: RequestUser) {
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

  private serialize(
    draft: {
      id: string;
      items: Prisma.JsonValue;
      disposalItems: Prisma.JsonValue;
      expenses: Prisma.JsonValue;
      customerName: string | null;
      updatedAt: Date;
    },
    staff: { id: string; firstName: string; lastName: string; email: string },
    branch?: { id: string; name: string } | null,
  ) {
    const items = Array.isArray(draft.items) ? (draft.items as any[]) : [];
    const disposalItems = Array.isArray(draft.disposalItems) ? (draft.disposalItems as any[]) : [];
    const expenses = Array.isArray(draft.expenses) ? (draft.expenses as any[]) : [];
    const total = items.reduce(
      (sum, i) => sum + Number(i.unitPrice ?? 0) * Number(i.quantity ?? 0) - Number(i.discount ?? 0),
      0,
    );
    const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    return {
      id: draft.id,
      staff: { id: staff.id, name: `${staff.firstName} ${staff.lastName}`.trim(), email: staff.email },
      branch: branch ? { id: branch.id, name: branch.name } : null,
      items,
      disposalItems,
      expenses,
      customerName: draft.customerName,
      total,
      expensesTotal,
      updatedAt: draft.updatedAt,
    };
  }
}
