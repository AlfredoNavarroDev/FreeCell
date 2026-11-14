import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RejectClaimDto {
  @ApiProperty()
  @IsString({ message: 'reason debe ser texto' })
  @Length(3, 500, { message: 'reason debe tener entre 3 y 500 caracteres' })
  reason!: string;
}
