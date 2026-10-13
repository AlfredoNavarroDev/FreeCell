import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  JOB_RELEASE,
  QUEUE_ORDERS,
  RELEASE_DELAY_MARGIN_MS,
  releaseJobId,
} from './orders.constants';

@Injectable()
export class OrdersQueueService {
  constructor(@InjectQueue(QUEUE_ORDERS) private readonly queue: Queue) {}

  async scheduleRelease(orderId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      JOB_RELEASE,
      { orderId },
      {
        jobId: releaseJobId(orderId),
        delay: delayMs + RELEASE_DELAY_MARGIN_MS,
      },
    );
  }
}
