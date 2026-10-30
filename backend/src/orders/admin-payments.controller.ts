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
import { AdminPaymentsService } from './admin-payments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { AdminPaymentResponseDto } from './dto/admin-payment-response.dto';
import { ListAdminPaymentsQueryDto } from './dto/list-admin-payments-query.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';

@ApiTags('admin-payments')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: AdminPaymentsService) {}

  @Get()
  list(
    @Query() dto: ListAdminPaymentsQueryDto,
  ): Promise<PaginatedResponseDto<AdminPaymentResponseDto>> {
    return this.payments.list(dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OrderResponseDto> {
    return this.payments.approve(admin, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectPaymentDto,
  ): Promise<OrderResponseDto> {
    return this.payments.reject(admin, id, dto);
  }
}
