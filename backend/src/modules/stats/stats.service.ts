import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus, ExpenseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}
  async dashboard() {
    const [
      shops,
      products,
      brands,
      pendingSales,
      approvedSales,
      staff,
      admins,
      approvedTotal,
    ] = await Promise.all([
      this.prisma.branch.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.brand.count({ where: { deletedAt: null } }),
      this.prisma.sale.count({ where: { status: SaleStatus.PENDING } }),
      this.prisma.sale.count({ where: { status: SaleStatus.APPROVED } }),
      this.prisma.user.count({
        where: { deletedAt: null, role: { name: 'Staff' } },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, role: { name: 'Admin' } },
      }),
      this.prisma.sale.aggregate({
        where: { status: SaleStatus.APPROVED },
        _sum: { total: true },
      }),
    ]);

    return {
      shops,
      products,
      brands,
      pendingSales,
      approvedSales,
      staff,
      admins,
      approvedSalesTotal: Number(approvedTotal._sum.total ?? 0),
    };
  }

  /**
   * Approved-sales totals bucketed over time for the Sales Overview chart.
   */
  async salesOverview(period: string, branchId?: string) {
    const unit = period === 'monthly' ? 'month' : period === 'weekly' ? 'week' : 'day';
    const sinceDays = period === 'monthly' ? 365 : period === 'weekly' ? 84 : 14;

    const params: any[] = [];
    let branchClause = '';
    if (branchId) {
      params.push(branchId);
      branchClause = ` AND branch_id = $${params.length}::uuid`;
    }

    const sql =
      `SELECT date_trunc('${unit}', created_at) AS bucket, ` +
      `COALESCE(SUM(total), 0) AS total, COUNT(*) AS count ` +
      `FROM sales WHERE status = 'APPROVED' ` +
      `AND created_at >= now() - interval '${sinceDays} days'${branchClause} ` +
      `GROUP BY bucket ORDER BY bucket ASC`;

    const rows = await this.prisma.$queryRawUnsafe<
      { bucket: Date; total: any; count: any }[]
    >(sql, ...params);

    return rows.map((r) => ({
      date: r.bucket,
      total: Number(r.total),
      count: Number(r.count),
    }));
  }

  /**
   * Top selling products (by units) from approved sales.
   */
  async topProducts(branchId?: string) {
    const items = await this.prisma.saleItem.groupBy({
      by: ['name', 'brandName'],
      where: {
        sale: { status: SaleStatus.APPROVED, ...(branchId ? { branchId } : {}) },
      },
      _sum: { quantity: true, subTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    return items.map((i) => ({
      name: i.name,
      brand: i.brandName,
      quantity: i._sum.quantity ?? 0,
      revenue: Number(i._sum.subTotal ?? 0),
    }));
  }

  /**
   * Today's approved Total Sales / Total Expenses / Net for one branch.
   * Based on `decidedAt` (when each was actually approved), not `createdAt`,
   * and only counts APPROVED records — pending items could still be
   * declined, so they'd make this a moving, unreliable number.
   */
  async branchSummary(branchId: string | undefined, actor: RequestUser) {
    const resolvedBranchId = await this.resolveBranchForActor(actor, branchId);

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [salesAgg, expensesAgg] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { branchId: resolvedBranchId, status: SaleStatus.APPROVED, decidedAt: { gte: start } },
        _sum: { total: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          branchId: resolvedBranchId,
          status: ExpenseStatus.APPROVED,
          decidedAt: { gte: start },
        },
        _sum: { amount: true },
      }),
    ]);

    const totalSales = Number(salesAgg._sum.total ?? 0);
    const totalExpenses = Number(expensesAgg._sum.amount ?? 0);

    return {
      branchId: resolvedBranchId,
      totalSales,
      totalExpenses,
      net: totalSales - totalExpenses,
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
    return branchId;
  }
}
