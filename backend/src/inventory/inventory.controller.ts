import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { AvailableLicenseDto } from './dto/available-license.dto';
import { BatchPreviewDto } from './dto/batch-preview.dto';
import { BatchPreviewResultDto } from './dto/batch-preview-result.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateBatchResultDto } from './dto/create-batch-result.dto';
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

  @Post('batches/preview')
  @HttpCode(200)
  preview(@Body() dto: BatchPreviewDto): Promise<BatchPreviewResultDto> {
    return this.inventory.preview(dto);
  }

  @Post('batches')
  @HttpCode(200)
  createBatch(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateBatchDto,
  ): Promise<CreateBatchResultDto> {
    return this.inventory.createBatch(dto, admin);
  }
}
