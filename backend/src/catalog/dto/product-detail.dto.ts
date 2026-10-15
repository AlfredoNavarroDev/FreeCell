import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PlanKind } from '../../database/enums';
import type { StockState } from '../../database/views/plan-stock.view';

export class PlanPriceDto {
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() priceCents!: number;
}

export class PlanOfferDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PlanKind }) kind!: PlanKind;
  @ApiProperty() durationDays!: number;
  @ApiProperty({ type: [PlanPriceDto] }) prices!: PlanPriceDto[];
  @ApiProperty({ enum: ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'] })
  stockState!: StockState;
}

export class ProductDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) whatIncluded!: string | null;
  @ApiProperty({ type: String, nullable: true }) compatibility!: string | null;
  @ApiProperty({ type: String, nullable: true })
  activationGuide!: string | null;
  @ApiProperty({ type: 'array', nullable: true })
  faq!: { question: string; answer: string }[] | null;
  @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @ApiProperty() requiresToolUsername!: boolean;
  @ApiProperty({ type: [PlanOfferDto] }) plans!: PlanOfferDto[];
}
