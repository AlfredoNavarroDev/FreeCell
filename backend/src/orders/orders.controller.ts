import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Crea el pedido y reserva una licencia por 30 minutos. */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    const order = await this.orders.reserve(user.id, dto);
    return { id: order.id, status: order.status, totalCents: order.totalCents, expiresAt: order.expiresAt };
  }
}
