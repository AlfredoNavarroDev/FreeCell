import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { Length } from 'class-validator';

export class VoidLicenseDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 500, { message: 'reason no puede estar vacío' })
  reason!: string;
}
