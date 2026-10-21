import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PaymentMethodKind } from '../../database/enums';

export class CreatePaymentMethodDto {
  @ApiProperty()
  @IsString({ message: 'code debe ser texto' })
  @Matches(/^[a-z0-9_-]{2,40}$/, {
    message: 'code solo admite minúsculas, números, "-" y "_" (2 a 40 caracteres)',
  })
  code!: string;

  @ApiProperty()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 80, { message: 'name admite hasta 80 caracteres' })
  name!: string;

  @ApiProperty({ enum: PaymentMethodKind })
  @IsIn(Object.values(PaymentMethodKind), {
    message: 'kind debe ser WALLET, BANK_TRANSFER o CRYPTO',
  })
  kind!: PaymentMethodKind;

  @ApiProperty({ enum: CURRENCIES, isArray: true })
  @IsArray({ message: 'currencies debe ser una lista' })
  @ArrayMinSize(1, { message: 'currencies no puede estar vacío' })
  @ArrayUnique({ message: 'currencies no puede repetir una moneda' })
  @IsIn(CURRENCIES, { each: true, message: 'Cada moneda debe ser PEN o USD' })
  currencies!: Currency[];

  @ApiProperty({ type: Object })
  @IsObject({ message: 'instructions debe ser un objeto' })
  instructions!: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt({ message: 'sortOrder debe ser un número entero' })
  sortOrder?: number;
}
