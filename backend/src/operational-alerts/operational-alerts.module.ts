import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QUEUE_OPERATIONAL_ALERTS } from './operational-alerts.constants';
import { OperationalAlertsService } from './operational-alerts.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_OPERATIONAL_ALERTS }),
    NotificationsModule,
  ],
  providers: [OperationalAlertsService],
  exports: [BullModule, OperationalAlertsService],
})
export class OperationalAlertsModule {}
