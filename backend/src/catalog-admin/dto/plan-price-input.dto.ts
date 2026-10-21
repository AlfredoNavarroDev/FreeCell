import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class PlanPriceInputDto {
  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES, { message: 'currency debe ser PEN o USD' })
  currency!: Currency;

  @ApiProperty({ minimum: 1 })
  @IsInt({ message: 'priceCents debe ser un número entero' })
  @Min(1, { message: 'priceCents debe ser mayor a 0' })
  priceCents!: number;
}
