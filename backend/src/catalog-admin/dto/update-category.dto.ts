import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 80, { message: 'name admite hasta 80 caracteres' })
  name?: string;
}
