import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class SaleItemInputDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2, description: 'Quantity sold' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateSaleDto {
  @ApiProperty({
    required: false,
    description: 'Branch ID. Optional for Staff (defaults to their branch); required for Owner/Admin.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ required: false, example: 'Walk-in' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;

  @ApiProperty({ enum: PaymentMethod, example: 'Cash' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({
    required: false,
    example: 'BDO',
    description: 'Which bank, when paymentMethod is BankTransfer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankNote?: string;

  @ApiProperty({ type: [SaleItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];
}
