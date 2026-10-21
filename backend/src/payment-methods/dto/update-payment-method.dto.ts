import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdatePaymentMethodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'code debe ser texto' })
  @Matches(/^[a-z0-9_-]{2,40}$/, {
    message: 'code solo admite minúsculas, números, "-" y "_" (2 a 40 caracteres)',
  })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 80, { message: 'name admite hasta 80 caracteres' })
  name?: string;

  @ApiPropertyOptional({ enum: PaymentMethodKind })
  @IsOptional()
  @IsIn(Object.values(PaymentMethodKind), {
    message: 'kind debe ser WALLET, BANK_TRANSFER o CRYPTO',
  })
  kind?: PaymentMethodKind;

  @ApiPropertyOptional({ enum: CURRENCIES, isArray: true })
  @IsOptional()
  @IsArray({ message: 'currencies debe ser una lista' })
  @ArrayMinSize(1, { message: 'currencies no puede estar vacío' })
  @ArrayUnique({ message: 'currencies no puede repetir una moneda' })
  @IsIn(CURRENCIES, { each: true, message: 'Cada moneda debe ser PEN o USD' })
  currencies?: Currency[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject({ message: 'instructions debe ser un objeto' })
  instructions?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt({ message: 'sortOrder debe ser un número entero' })
  sortOrder?: number;
}
