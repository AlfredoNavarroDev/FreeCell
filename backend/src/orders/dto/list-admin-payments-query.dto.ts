import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaymentStatus } from '../../database/enums';

export class ListAdminPaymentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsIn(Object.values(PaymentStatus), {
    message: 'status no es un estado válido',
  })
  status?: PaymentStatus;
}
