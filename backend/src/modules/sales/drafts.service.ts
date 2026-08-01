import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertDraftDto } from './dto/upsert-draft.dto';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@Injectable()
export class DraftsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Upsert the current staff member's draft cart. An empty `items` array
   * deletes the row instead of leaving a stale empty draft around for
   * Admins to see.
   */
  async upsertMine(dto: UpsertDraftDto, actor: RequestUser) {
    const branchId = await this.resolveBranchForActor(actor);

    if (dto.items.length === 0) {
      await this.prisma.draftOrder.deleteMany({ where: { staffId: actor.userId } });
      return { message: 'Draft cleared' };
    }

    await this.prisma.draftOrder.upsert({
      where: { staffId: actor.userId },
      create: {
        staffId: actor.userId,
        branchId,
        items: dto.items as unknown as Prisma.InputJsonValue,
        paymentMethod: dto.paymentMethod ?? 'Cash',
        customerName: dto.customerName?.trim() || null,
      },
      update: {
        branchId,
        items: dto.items as unknown as Prisma.InputJsonValue,
        paymentMethod: dto.paymentMethod ?? 'Cash',
        customerName: dto.customerName?.trim() || null,
      },
    });

    return { message: 'Draft saved' };
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
      paymentMethod: string;
      customerName: string | null;
      updatedAt: Date;
    },
    staff: { id: string; firstName: string; lastName: string; email: string },
    branch?: { id: string; name: string } | null,
  ) {
    const items = Array.isArray(draft.items) ? (draft.items as any[]) : [];
    const total = items.reduce(
      (sum, i) => sum + Number(i.unitPrice ?? 0) * Number(i.quantity ?? 0),
      0,
    );
    return {
      id: draft.id,
      staff: { id: staff.id, name: `${staff.firstName} ${staff.lastName}`.trim(), email: staff.email },
      branch: branch ? { id: branch.id, name: branch.name } : null,
      items,
      paymentMethod: draft.paymentMethod,
      customerName: draft.customerName,
      total,
      updatedAt: draft.updatedAt,
    };
  }
}
