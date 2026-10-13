import { Module } from '@nestjs/common';
import { NotificationsDeliveryModule } from './notifications-delivery.module';
import { NotificationsModule } from './notifications.module';
import { NotificationsProcessor } from './notifications.processor';

@Module({
  imports: [NotificationsModule, NotificationsDeliveryModule],
  providers: [NotificationsProcessor],
})
export class NotificationsWorkerModule {}
