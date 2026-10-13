import { Module } from '@nestjs/common';
import { NotificationsWorkerModule } from './notifications/notifications-worker.module';
import { OrdersWorkerModule } from './orders/orders-worker.module';

/** Todos los processors de BullMQ. */
@Module({
  imports: [OrdersWorkerModule, NotificationsWorkerModule],
})
export class WorkersModule {}
