import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

// Mirrors the frontend's client-side DraftItem shape so the admin view can
// render it without extra product lookups (and stays accurate even if the
// product is later renamed/repriced/archived while the draft is open).
export class DraftItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  brandName: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  image?: string | null;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class UpsertDraftDto {
  @ApiProperty({ type: [DraftItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftItemDto)
  items: DraftItemDto[];

  @ApiProperty({ enum: PaymentMethod, required: false, default: 'Cash' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;
}
