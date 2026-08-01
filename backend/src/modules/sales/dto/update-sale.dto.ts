import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { SaleItemInputDto } from './create-sale.dto';

/**
 * Edit a PENDING sale. Any field may be omitted; only provided fields change.
 * When `items` is provided it fully replaces the current line items.
 */
export class UpdateSaleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ required: false, example: 'BDO' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankNote?: string;

  @ApiProperty({ type: [SaleItemInputDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items?: SaleItemInputDto[];
}
