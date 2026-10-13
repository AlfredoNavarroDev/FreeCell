import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NOTIFICATIONS } from './notification.types';
import { NotificationsService } from './notifications.service';

/** Lado productor (API): registra la cola y expone enqueue. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })],
  providers: [NotificationsService],
  exports: [NotificationsService, BullModule],
})
export class NotificationsModule {}
