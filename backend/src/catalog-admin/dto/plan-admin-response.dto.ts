import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { Plan } from '../../database/entities';
import { PlanKind } from '../../database/enums';

export class PlanPriceResponseDto {
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() priceCents!: number;
}

export class PlanAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PlanKind }) kind!: PlanKind;
  @ApiProperty() durationDays!: number;
  @ApiProperty() lowStockThreshold!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: [PlanPriceResponseDto] }) prices!: PlanPriceResponseDto[];

  static from(
    entity: Plan,
    prices: { currency: Currency; priceCents: number }[],
  ): PlanAdminResponseDto {
    return {
      id: entity.id,
      productId: entity.productId,
      name: entity.name,
      kind: entity.kind,
      durationDays: entity.durationDays,
      lowStockThreshold: entity.lowStockThreshold,
      active: entity.active,
      prices,
    };
  }
}
