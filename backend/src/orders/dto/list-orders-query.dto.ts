import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { OrderStatus } from '../../database/enums';

export class ListOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsIn(Object.values(OrderStatus), { message: 'status no es un estado válido' })
  status?: OrderStatus;
}
