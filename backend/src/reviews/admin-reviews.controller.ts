import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { AdminReviewsService } from './admin-reviews.service';
import type {
  AdminReviewResponseDto,
  ReviewActionResultDto,
} from './dto/admin-review-response.dto';
import { ListAdminReviewsQueryDto } from './dto/list-admin-reviews-query.dto';

@ApiTags('admin-reviews')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: AdminReviewsService) {}

  @Get()
  list(
    @Query() dto: ListAdminReviewsQueryDto,
  ): Promise<PaginatedResponseDto<AdminReviewResponseDto>> {
    return this.reviews.list(dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReviewActionResultDto> {
    return this.reviews.approve(admin, id);
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ReviewActionResultDto> {
    return this.reviews.hide(admin, id);
  }
}
