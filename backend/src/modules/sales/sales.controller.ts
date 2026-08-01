import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a sale (starts as PENDING approval)' })
  async create(@Body() dto: CreateSaleDto, @CurrentUser() user: RequestUser) {
    const data = await this.salesService.create(dto, user);
    return { success: true, data };
  }

  @Get('records')
  @ApiOperation({ summary: 'List approved sales (records)' })
  async records(@Query() query: QuerySaleDto, @CurrentUser() user: RequestUser) {
    const result = await this.salesService.findRecords(query, user);
    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending sales awaiting approval' })
  async pending(@Query() query: QuerySaleDto, @CurrentUser() user: RequestUser) {
    const result = await this.salesService.findPending(query, user);
    return {
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a sale by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a pending sale (items, payment method, customer)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.update(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/approve')
  @Roles('Admin')
  @ApiOperation({ summary: 'Approve a pending sale (deducts stock)' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.approve(id, user);
    return { success: true, data };
  }

  @Post(':id/decline')
  @Roles('Admin')
  @ApiOperation({ summary: 'Decline a pending sale' })
  async decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.decline(id, user);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a pending/declined sale' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.salesService.remove(id, user);
    return { success: true, data };
  }
}
