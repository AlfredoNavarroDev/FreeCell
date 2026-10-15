import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nombre de producto' })
  @IsOptional()
  @IsString({ message: 'query debe ser texto' })
  @Length(1, 80, { message: 'query admite hasta 80 caracteres' })
  query?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id de categoría' })
  @IsOptional()
  @IsUUID('all', { message: 'category debe ser un UUID' })
  category?: string;

  @ApiPropertyOptional({ enum: CURRENCIES, default: 'PEN' })
  @IsOptional()
  @IsIn(CURRENCIES, { message: 'currency debe ser PEN o USD' })
  currency: Currency = 'PEN';
}
