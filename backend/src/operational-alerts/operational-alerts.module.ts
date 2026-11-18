import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QUEUE_NOTIFICATIONS } from '../notifications/notification.types';
import { QUEUE_ORDERS } from '../orders/orders.constants';
import { QUEUE_OPERATIONAL_ALERTS } from './operational-alerts.constants';
import { OperationalAlertsService } from './operational-alerts.service';

/**
 * Registra también `orders` y `notifications` (no solo la propia) porque `checkFailedJobs`
 * necesita leer el conteo de fallidos de las 3; `registerQueue` con un nombre ya registrado en
 * otro módulo comparte la misma instancia de BullMQ (no duplica la conexión).
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_OPERATIONAL_ALERTS },
      { name: QUEUE_ORDERS },
      { name: QUEUE_NOTIFICATIONS },
    ),
    NotificationsModule,
  ],
  providers: [OperationalAlertsService],
  exports: [BullModule, OperationalAlertsService],
})
export class OperationalAlertsModule {}
