import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class ListPaymentMethodsQueryDto {
  @ApiPropertyOptional({ enum: CURRENCIES })
  @IsOptional()
  @IsIn(CURRENCIES, { message: 'La moneda debe ser PEN o USD' })
  currency?: Currency;
}
