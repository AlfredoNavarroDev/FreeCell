import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationSender } from './notification-sender.service';
import { NotificationJob, QUEUE_NOTIFICATIONS } from './notification.types';

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly sender: NotificationSender) {
    super();
  }

  process(job: Job<NotificationJob>): Promise<'sent' | 'skipped'> {
    return this.sender.handle(job.data);
  }
}
