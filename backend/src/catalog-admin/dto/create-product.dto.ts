import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 120, { message: 'name admite hasta 120 caracteres' })
  name!: string;

  @ApiProperty()
  @IsString({ message: 'slug debe ser texto' })
  @Matches(/^[a-z0-9-]{1,140}$/, {
    message: 'slug solo admite minúsculas, números y guiones',
  })
  slug!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all', { message: 'categoryId debe ser un UUID' })
  categoryId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'requiresToolUsername debe ser verdadero o falso' })
  requiresToolUsername?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'description debe ser texto' })
  description?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;
}
