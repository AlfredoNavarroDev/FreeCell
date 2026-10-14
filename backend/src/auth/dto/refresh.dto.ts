import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty()
  @IsString({ message: 'El refresh token debe ser texto' })
  @IsNotEmpty({ message: 'Falta el refresh token' })
  @MaxLength(200, { message: 'Refresh token inválido' })
  refreshToken!: string;
}
