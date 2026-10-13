import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class CreateOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'planId debe ser un UUID' })
  planId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Max(5, { message: 'La cantidad máxima por plan es 5' })
  qty!: number;
}

export class CreateOrderDto {
  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES, { message: 'La moneda debe ser PEN o USD' })
  currency!: Currency;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray({ message: 'items debe ser una lista' })
  @ArrayMinSize(1, { message: 'El carrito está vacío' })
  @ArrayMaxSize(10, { message: 'El carrito admite hasta 10 planes distintos' })
  @ArrayUnique((item: CreateOrderItemDto) => item.planId, {
    message: 'No repitas un plan en el carrito',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional({
    description: 'Usuario en la herramienta, si el producto lo requiere (D14)',
  })
  @IsOptional()
  @IsString({ message: 'toolUsername debe ser texto' })
  @Length(1, 120, { message: 'toolUsername admite hasta 120 caracteres' })
  toolUsername?: string;
}
