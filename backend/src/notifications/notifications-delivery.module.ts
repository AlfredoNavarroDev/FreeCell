import { Module } from '@nestjs/common';
import { LogChannel } from './channels/log.channel';
import { NOTIFICATION_CHANNEL } from './channels/notification-channel';
import { NotificationSender } from './notification-sender.service';

/** Envío sin worker: las pruebas lo usan directo y el worker lo envuelve con el processor. */
@Module({
  providers: [
    NotificationSender,
    { provide: NOTIFICATION_CHANNEL, useClass: LogChannel },
  ],
  exports: [NotificationSender],
})
export class NotificationsDeliveryModule {}
