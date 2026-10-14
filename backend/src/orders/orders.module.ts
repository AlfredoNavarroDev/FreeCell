import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { OrderReleaseService } from './order-release.service';
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
  providers: [OrdersService, OrdersQueueService, OrderReleaseService],
  exports: [BullModule, OrderReleaseService],
})
export class OrdersModule {}
