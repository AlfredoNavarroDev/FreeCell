import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'cliente@correo.pe' })
  // Se recorta antes de validar: el correo se normaliza igual en UsersService, pero
  // @IsEmail por sí solo rechaza espacios al inicio/final.
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString({ message: 'La contraseña debe ser texto' })
  @Length(8, 72, {
    message: 'La contraseña debe tener entre 8 y 72 caracteres',
  })
  password!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(80, { message: 'El nombre admite hasta 80 caracteres' })
  name?: string;
}
