import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'cliente@correo.pe' })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  email!: string;

  @ApiProperty()
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'Ingresa tu contraseña' })
  @MaxLength(72, { message: 'La contraseña admite hasta 72 caracteres' })
  password!: string;
}
