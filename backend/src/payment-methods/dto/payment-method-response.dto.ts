import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PaymentMethod } from '../../database/entities';
import { PaymentMethodKind } from '../../database/enums';

export class PaymentMethodResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PaymentMethodKind }) kind!: PaymentMethodKind;
  @ApiProperty({ enum: CURRENCIES, isArray: true }) currencies!: Currency[];
  @ApiProperty({ type: Object }) instructions!: Record<string, unknown>;
  @ApiProperty() active!: boolean;
  @ApiProperty() sortOrder!: number;

  static from(entity: PaymentMethod): PaymentMethodResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      kind: entity.kind,
      currencies: entity.currencies,
      instructions: entity.instructions,
      active: entity.active,
      sortOrder: entity.sortOrder,
    };
  }
}
