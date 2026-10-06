import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_RESERVATIONS } from '../queues/queues.constants';
import { OrdersService } from './orders.service';

@Processor(QUEUE_RESERVATIONS)
export class ReservationsProcessor extends WorkerHost {
  constructor(private readonly orders: OrdersService) {
    super();
  }

  async process(job: Job<{ orderId?: string }>) {
    switch (job.name) {
      case 'release':
        return this.orders.releaseIfUnpaid(job.data.orderId!);
      case 'sweep':
        return this.orders.sweepExpired();
      default:
        throw new Error(`Trabajo desconocido: ${job.name}`);
    }
  }
}
