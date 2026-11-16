import { Module } from '@nestjs/common';
import { NotificationsWorkerModule } from './notifications/notifications-worker.module';
import { OperationalAlertsWorkerModule } from './operational-alerts/operational-alerts-worker.module';
import { OrdersWorkerModule } from './orders/orders-worker.module';

/** Todos los processors de BullMQ. */
@Module({
  imports: [
    OrdersWorkerModule,
    NotificationsWorkerModule,
    OperationalAlertsWorkerModule,
  ],
})
export class WorkersModule {}
