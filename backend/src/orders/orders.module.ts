import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Order } from '../database/entities';
import { QUEUE_RESERVATIONS } from '../queues/queues.constants';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ReservationsProcessor } from './reservations.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_RESERVATIONS }), TypeOrmModule.forFeature([Order]), AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService, ReservationsProcessor],
  exports: [OrdersService],
})
export class OrdersModule {}
