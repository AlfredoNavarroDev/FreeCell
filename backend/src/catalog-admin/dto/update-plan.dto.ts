import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlanKind } from '../../database/enums';
import { PlanPriceInputDto } from './plan-price-input.dto';

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Length(1, 120, { message: 'name admite hasta 120 caracteres' })
  name?: string;

  @ApiPropertyOptional({ enum: PlanKind })
  @IsOptional()
  @IsIn(Object.values(PlanKind), { message: 'kind debe ser NEW o RENEWAL' })
  kind?: PlanKind;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt({ message: 'durationDays debe ser un número entero' })
  @Min(1, { message: 'durationDays debe ser mayor a 0' })
  durationDays?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt({ message: 'lowStockThreshold debe ser un número entero' })
  @Min(0, { message: 'lowStockThreshold no puede ser negativo' })
  lowStockThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;

  @ApiPropertyOptional({
    type: [PlanPriceInputDto],
    description:
      'Agrega o actualiza precios por moneda (upsert); no borra monedas omitidas',
  })
  @IsOptional()
  @IsArray({ message: 'prices debe ser una lista' })
  @ArrayMinSize(1, { message: 'prices necesita al menos un precio si se envía' })
  @ArrayUnique((price: PlanPriceInputDto) => price.currency, {
    message: 'No repitas la misma moneda en prices',
  })
  @ValidateNested({ each: true })
  @Type(() => PlanPriceInputDto)
  prices?: PlanPriceInputDto[];
}
