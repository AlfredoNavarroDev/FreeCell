import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../database/enums';
import { AvailableLicenseDto } from './dto/available-license.dto';
import { InventoryResponseDto } from './dto/inventory-item.dto';
import { InventoryService } from './inventory.service';

@ApiTags('admin-inventory')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(): Promise<InventoryResponseDto> {
    return this.inventory.list();
  }

  @Get('plans/:planId/licenses')
  listAvailableLicenses(
    @Param('planId', new ParseUUIDPipe()) planId: string,
  ): Promise<AvailableLicenseDto[]> {
    return this.inventory.listAvailableLicenses(planId);
  }
}
