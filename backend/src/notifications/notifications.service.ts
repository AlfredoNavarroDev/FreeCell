import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NotificationJob, QUEUE_NOTIFICATIONS } from './notification.types';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly queue: Queue<NotificationJob>,
  ) {}

  /** jobId = key: encolar dos veces el mismo mensaje no crea dos jobs. */
  async enqueue(job: NotificationJob): Promise<void> {
    await this.queue.add(job.template, job, { jobId: job.key });
  }
}
