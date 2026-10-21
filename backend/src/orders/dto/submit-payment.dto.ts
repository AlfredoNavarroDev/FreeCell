import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsString, IsUUID, Length, Matches } from 'class-validator';

export class SubmitPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'paymentMethodId debe ser un UUID' })
  paymentMethodId!: string;

  @ApiProperty({ description: 'Llave del archivo en R2, devuelta por /orders/:id/payment/upload-url' })
  @IsString({ message: 'proofKey debe ser texto' })
  @Length(1, 255, { message: 'proofKey admite hasta 255 caracteres' })
  proofKey!: string;

  @ApiProperty({
    description:
      'Hash SHA-256 en hexadecimal del archivo subido, calculado por el cliente (D71)',
  })
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'proofHash debe ser un hash SHA-256 en hexadecimal (64 caracteres)',
  })
  proofHash!: string;

  @ApiProperty()
  @IsString({ message: 'operationNumber debe ser texto' })
  @Length(1, 120, { message: 'operationNumber admite hasta 120 caracteres' })
  operationNumber!: string;

  @ApiProperty({
    description: 'Declaración de titularidad/autorización sobre el equipo (RF-COM-13, D43)',
  })
  @Equals(true, {
    message: 'Debes aceptar la declaración de titularidad/autorización',
  })
  acceptsLegalDeclaration!: boolean;
}
