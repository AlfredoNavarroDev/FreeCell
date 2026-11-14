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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { AdminSupportService } from './admin-support.service';
import {
  AdminTicketDetailDto,
  AdminTicketSummaryDto,
  TicketCloseResultDto,
} from './dto/admin-ticket-response.dto';
import { ListAdminTicketsQueryDto } from './dto/list-admin-tickets-query.dto';
import { MessageBodyDto } from './dto/ticket-message.dto';

@ApiTags('admin-support')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/support-tickets')
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get()
  list(
    @Query() dto: ListAdminTicketsQueryDto,
  ): Promise<PaginatedResponseDto<AdminTicketSummaryDto>> {
    return this.support.list(dto);
  }

  @Get(':id')
  detail(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminTicketDetailDto> {
    return this.support.detail(id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MessageBodyDto,
  ): Promise<AdminTicketDetailDto> {
    return this.support.reply(admin, id, dto);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TicketCloseResultDto> {
    return this.support.close(admin, id);
  }
}
