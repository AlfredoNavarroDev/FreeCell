import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class CreateClaimDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'orderId debe ser un UUID' })
  orderId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'orderItemId debe ser un UUID' })
  orderItemId!: string;

  @ApiProperty()
  @IsString({ message: 'reason debe ser texto' })
  @Length(3, 500, { message: 'reason debe tener entre 3 y 500 caracteres' })
  reason!: string;
}
