import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanAdminResponseDto } from './dto/plan-admin-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansAdminService } from './plans-admin.service';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/plans')
export class PlansAdminController {
  constructor(private readonly plans: PlansAdminService) {}

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    return this.plans.create(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    return this.plans.update(admin, id, dto);
  }
}
