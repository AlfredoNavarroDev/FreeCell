import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { MessageBodyDto } from './dto/ticket-message.dto';
import { TicketDetailDto, TicketSummaryDto } from './dto/ticket-response.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support-tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ): Promise<TicketDetailDto> {
    return this.support.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListTicketsQueryDto,
  ): Promise<PaginatedResponseDto<TicketSummaryDto>> {
    return this.support.listForUser(user.id, dto);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TicketDetailDto> {
    return this.support.getForUser(user.id, id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MessageBodyDto,
  ): Promise<TicketDetailDto> {
    return this.support.reply(user, id, dto);
  }
}
