import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** RF-ADM-13: motivos predefinidos; el texto se muestra tal cual al cliente. */
export enum PaymentRejectionReason {
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  ILLEGIBLE_PROOF = 'ILLEGIBLE_PROOF',
  OPERATION_NOT_FOUND = 'OPERATION_NOT_FOUND',
}

export const PAYMENT_REJECTION_REASON_LABEL: Record<
  PaymentRejectionReason,
  string
> = {
  [PaymentRejectionReason.AMOUNT_MISMATCH]: 'Monto incorrecto',
  [PaymentRejectionReason.ILLEGIBLE_PROOF]: 'Comprobante ilegible',
  [PaymentRejectionReason.OPERATION_NOT_FOUND]: 'Operación no encontrada',
};

export class RejectPaymentDto {
  @ApiProperty({ enum: PaymentRejectionReason })
  @IsIn(Object.values(PaymentRejectionReason), {
    message: 'reason no es un motivo válido',
  })
  reason!: PaymentRejectionReason;
}
