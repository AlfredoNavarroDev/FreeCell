import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import type { StockState } from '../../database/views/plan-stock.view';

export class ProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @ApiProperty() priceFromCents!: number;
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty({ enum: ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'] })
  stockState!: StockState;
}
