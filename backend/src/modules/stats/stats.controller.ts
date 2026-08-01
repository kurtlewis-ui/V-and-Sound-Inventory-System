import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard summary counts' })
  async dashboard() {
    const data = await this.statsService.dashboard();
    return { success: true, data };
  }

  @Get('sales-overview')
  @ApiOperation({ summary: 'Approved-sales totals over time' })
  async salesOverview(
    @Query('period') period = 'daily',
    @Query('branchId') branchId?: string,
  ) {
    const data = await this.statsService.salesOverview(period, branchId || undefined);
    return { success: true, data };
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Top selling products by units' })
  async topProducts(@Query('branchId') branchId?: string) {
    const data = await this.statsService.topProducts(branchId || undefined);
    return { success: true, data };
  }

  @Get('branch-summary')
  @ApiOperation({ summary: "Today's approved Total Sales / Total Expenses / Net for a branch" })
  async branchSummary(@Query('branchId') branchId: string | undefined, @CurrentUser() user: RequestUser) {
    const data = await this.statsService.branchSummary(branchId || undefined, user);
    return { success: true, data };
  }
}
