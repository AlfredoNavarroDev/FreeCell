import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PaymentStatus } from '../../database/enums';

export class AdminPaymentItemDto {
  @ApiProperty() planId!: string;
  @ApiProperty() unitPriceCents!: number;
  @ApiProperty() productName!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() availableStock!: number;
}

interface AdminPaymentRow {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  status: PaymentStatus;
  paymentMethodId: string;
  paymentMethodName: string;
  operationNumber: string;
  proofKey: string;
  totalCents: number;
  currency: Currency;
  expiresAt: Date;
  toolUsername: string | null;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string;
}

/** Fila de la cola de pagos (S6): lo que el admin necesita para decidir sin abrir otra pantalla. */
export class AdminPaymentResponseDto {
  @ApiProperty() paymentId!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() orderNumber!: number;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty() paymentMethodId!: string;
  @ApiProperty() paymentMethodName!: string;
  @ApiProperty() operationNumber!: string;
  @ApiProperty() proofUrl!: string;
  @ApiProperty() totalCents!: number;
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ type: String, nullable: true }) toolUsername!: string | null;
  @ApiProperty({ type: [AdminPaymentItemDto] }) items!: AdminPaymentItemDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty() customerEmail!: string;

  static from(
    row: AdminPaymentRow,
    items: AdminPaymentItemDto[],
    proofUrl: string,
  ): AdminPaymentResponseDto {
    return {
      paymentId: row.paymentId,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      status: row.status,
      paymentMethodId: row.paymentMethodId,
      paymentMethodName: row.paymentMethodName,
      operationNumber: row.operationNumber,
      proofUrl,
      totalCents: row.totalCents,
      currency: row.currency,
      expiresAt: row.expiresAt,
      toolUsername: row.toolUsername,
      items,
      createdAt: row.createdAt,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
    };
  }
}
