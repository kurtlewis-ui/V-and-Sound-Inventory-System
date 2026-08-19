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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ImportProductsDto } from './dto/import-products.dto';
import { RestockDto } from './dto/restock.dto';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Create a new product' })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.create(dto, user.userId);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List active products (with per-branch stock)' })
  async findAll(@Query() query: QueryProductDto, @CurrentUser() user: RequestUser) {
    const result = await this.productsService.findAll(query, user.role);
    return { success: true, data: result.data, pagination: result.pagination };
  }

  @Post('import')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Bulk import products (creates/updates; auto-creates brands)' })
  async importProducts(@Body() dto: ImportProductsDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.importProducts(dto.products, user.userId);
    return { success: true, data };
  }

  @Post('restock')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Add stock to products at branches' })
  async restock(@Body() dto: RestockDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.restock(dto.items, user.userId);
    return { success: true, data };
  }

  @Get('archived')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'List archived (soft-deleted) products' })
  async findArchived(@Query() query: QueryProductDto, @CurrentUser() user: RequestUser) {
    const result = await this.productsService.findArchived(query, user.role);
    return { success: true, data: result.data, pagination: result.pagination };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.findOne(id, user.role);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Update a product (and per-branch stock)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.update(id, dto, user.userId);
    return { success: true, data };
  }

  @Post(':id/restore')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Restore an archived product' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.restore(id, user.userId, user.role);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Archive (soft-delete) a product' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.remove(id, user.userId);
    return { success: true, data };
  }

  @Delete(':id/permanent')
  @Roles('Owner')
  @ApiOperation({ summary: 'Permanently delete a product (irreversible)' })
  async permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.permanentDelete(id, user.userId);
    return { success: true, data };
  }

  // ===========================================================================
  // VARIANTS (Flavors)
  // ===========================================================================

  @Get(':id/variants')
  @ApiOperation({ summary: 'List all active flavors/variants for a product' })
  async findVariants(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.findVariants(id, user.role);
    return { success: true, data };
  }

  @Post(':id/variants')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Add a flavor/variant to a product' })
  async createVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.createVariant(id, dto, user.userId);
    return { success: true, data };
  }

  @Patch('variants/:variantId')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Update a flavor/variant (name, price, cost)' })
  async updateVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.updateVariant(variantId, dto, user.userId);
    return { success: true, data };
  }

  @Delete('variants/:variantId')
  @Roles('Owner', 'Admin')
  @ApiOperation({ summary: 'Archive (soft-delete) a flavor/variant' })
  async removeVariant(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.removeVariant(variantId, user.userId);
    return { success: true, data };
  }
}
