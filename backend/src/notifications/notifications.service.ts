import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';

export interface NotificationJob {
  channel: 'email' | 'whatsapp';
  recipient: string;
  template: 'license-delivered' | 'payment-rejected' | 'claim-resolved';
  data: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue<NotificationJob>) {}

  /**
   * `key` identifica el mensaje de forma única (p. ej. "license-delivered:<orderId>").
   * Se usa como jobId, así encolar dos veces lo mismo no genera dos mensajes.
   */
  enqueue(key: string, job: NotificationJob) {
    return this.queue.add(job.template, job, { jobId: key });
  }
}
