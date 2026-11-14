import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTicketDto {
  @ApiProperty({ minLength: 3, maxLength: 150 })
  @Transform(trim)
  @IsString({ message: 'subject debe ser texto' })
  @Length(3, 150, { message: 'subject debe tener entre 3 y 150 caracteres' })
  subject!: string;

  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @Transform(trim)
  @IsString({ message: 'body debe ser texto' })
  @Length(1, 2000, { message: 'body debe tener entre 1 y 2000 caracteres' })
  body!: string;
}
