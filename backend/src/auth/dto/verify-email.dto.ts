import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty()
  @IsString({ message: 'token debe ser texto' })
  @Length(1, 200, { message: 'token inválido' })
  token!: string;
}
