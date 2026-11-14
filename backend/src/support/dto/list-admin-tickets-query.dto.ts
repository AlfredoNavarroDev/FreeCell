import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TicketStatus } from '../../database/enums';

export class ListAdminTicketsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsIn(Object.values(TicketStatus), {
    message: 'status no es un estado válido',
  })
  status?: TicketStatus;
}
