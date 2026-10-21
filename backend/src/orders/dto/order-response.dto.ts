import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { Order, OrderItem, Payment } from '../../database/entities';
import { OrderStatus, PaymentStatus } from '../../database/enums';

export class OrderItemResponseDto {
  @ApiProperty() planId!: string;
  @ApiProperty() unitPriceCents!: number;
}

export class OrderTrackingDto {
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) paymentApprovedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) deliveredAt!: Date | null;
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

  @ApiProperty({ enum: PaymentStatus, nullable: true })
  paymentStatus!: PaymentStatus | null;

  @ApiProperty({ type: String, nullable: true })
  paymentRejectionReason!: string | null;

  @ApiProperty({ type: OrderTrackingDto })
  tracking!: OrderTrackingDto;

  static from(
    order: Order,
    items: OrderItem[],
    latestPayment?: Payment | null,
  ): OrderResponseDto {
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
      paymentStatus: latestPayment?.status ?? null,
      paymentRejectionReason:
        latestPayment?.status === PaymentStatus.REJECTED
          ? latestPayment.rejectionReason
          : null,
      tracking: {
        createdAt: order.createdAt,
        paymentApprovedAt:
          latestPayment?.status === PaymentStatus.APPROVED
            ? latestPayment.reviewedAt
            : null,
        deliveredAt:
          order.status === OrderStatus.DELIVERED ? order.updatedAt : null,
      },
    };
  }
}
