import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminClaimsService } from './admin-claims.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import {
  AdminClaimResponseDto,
  ClaimActionResultDto,
} from './dto/admin-claim-response.dto';
import { ListAdminClaimsQueryDto } from './dto/list-admin-claims-query.dto';
import { RejectClaimDto } from './dto/reject-claim.dto';

@ApiTags('admin-claims')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/claims')
export class AdminClaimsController {
  constructor(private readonly claims: AdminClaimsService) {}

  @Get()
  list(
    @Query() dto: ListAdminClaimsQueryDto,
  ): Promise<PaginatedResponseDto<AdminClaimResponseDto>> {
    return this.claims.list(dto);
  }

  @Post(':id/replace')
  @HttpCode(200)
  replace(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ClaimActionResultDto> {
    return this.claims.replace(admin, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectClaimDto,
  ): Promise<ClaimActionResultDto> {
    return this.claims.reject(admin, id, dto);
  }
}
