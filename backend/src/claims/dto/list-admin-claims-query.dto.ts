import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ClaimStatus } from '../../database/enums';

export class ListAdminClaimsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional()
  @IsIn(Object.values(ClaimStatus), {
    message: 'status no es un estado válido',
  })
  status?: ClaimStatus;
}
