import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateReviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'orderId debe ser un UUID' })
  orderId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'productId debe ser un UUID' })
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt({ message: 'rating debe ser un número entero' })
  @Min(1, { message: 'rating debe estar entre 1 y 5' })
  @Max(5, { message: 'rating debe estar entre 1 y 5' })
  rating!: number;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @Transform(trim)
  @IsString({ message: 'body debe ser texto' })
  @Length(10, 1000, { message: 'body debe tener entre 10 y 1000 caracteres' })
  body!: string;
}
