import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class CreateBatchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'planId debe ser un UUID' })
  planId!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES, { message: 'costCurrency debe ser PEN o USD' })
  costCurrency!: Currency;

  @ApiProperty({ minimum: 0 })
  @IsInt({ message: 'unitCostCents debe ser un número entero' })
  @Min(0, { message: 'unitCostCents no puede ser negativo' })
  unitCostCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'supplier debe ser texto' })
  @Length(1, 120, { message: 'supplier admite hasta 120 caracteres' })
  supplier?: string;

  @ApiProperty({ type: [String] })
  @IsArray({ message: 'secrets debe ser una lista' })
  @ArrayMinSize(1, { message: 'secrets necesita al menos una línea' })
  @IsString({ each: true, message: 'Cada secreto debe ser texto' })
  secrets!: string[];
}
