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

  /**
   * Tras un rechazo (D18), el pedido vuelve a PENDING_PAYMENT con una nueva fecha de vencimiento:
   * el job original (si no se disparó aún) apunta al vencimiento viejo, así que hay que reemplazarlo.
   * `add` con un jobId ya existente no actualiza el delay, por eso se borra primero.
   */
  async rescheduleRelease(orderId: string, delayMs: number): Promise<void> {
    const existing = await this.queue.getJob(releaseJobId(orderId));
    if (existing) {
      await existing.remove();
    }
    await this.scheduleRelease(orderId, delayMs);
  }
}
