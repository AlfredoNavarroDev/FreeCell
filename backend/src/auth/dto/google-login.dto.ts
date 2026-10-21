import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token de Google (JWT), sin verificar todavía' })
  @IsString({ message: 'idToken debe ser texto' })
  @Length(1, 4096, { message: 'idToken inválido' })
  idToken!: string;
}
