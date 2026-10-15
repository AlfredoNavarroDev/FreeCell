import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class ProductDetailQueryDto {
  @ApiPropertyOptional({ enum: CURRENCIES, default: 'PEN' })
  @IsOptional()
  @IsIn(CURRENCIES, { message: 'currency debe ser PEN o USD' })
  currency: Currency = 'PEN';
}
