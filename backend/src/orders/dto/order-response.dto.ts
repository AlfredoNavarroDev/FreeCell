import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { Order, OrderItem } from '../../database/entities';
import { OrderStatus } from '../../database/enums';

export class OrderItemResponseDto {
  @ApiProperty() planId!: string;
  @ApiProperty() unitPriceCents!: number;
}

export class OrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: number;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() totalCents!: number;
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ type: String, nullable: true }) cancelReason!: string | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];

  static from(order: Order, items: OrderItem[]): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      currency: order.currency,
      expiresAt: order.expiresAt,
      cancelReason: order.cancelReason,
      items: [...items]
        .sort((a, b) => a.planId.localeCompare(b.planId))
        .map((item) => ({
          planId: item.planId,
          unitPriceCents: item.unitPriceCents,
        })),
    };
  }
}
