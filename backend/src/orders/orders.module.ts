import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { OrdersQueueService } from './orders-queue.service';
import { QUEUE_ORDERS } from './orders.constants';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_ORDERS }),
    NotificationsModule,
    SettingsModule,
    UsersModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersQueueService],
  exports: [BullModule],
})
export class OrdersModule {}
