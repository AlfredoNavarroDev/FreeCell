import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { OrderReleaseService } from './order-release.service';
import {
  JOB_RELEASE,
  JOB_SWEEP,
  QUEUE_ORDERS,
  SWEEP_EVERY_MS,
} from './orders.constants';

@Processor(QUEUE_ORDERS)
export class OrdersProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly release: OrderReleaseService,
    @InjectQueue(QUEUE_ORDERS) private readonly queue: Queue,
  ) {
    super();
  }

  /** Registra (o actualiza) el barrido cada 5 min. upsert evita duplicarlo entre reinicios. */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      JOB_SWEEP,
      { every: SWEEP_EVERY_MS },
      { name: JOB_SWEEP },
    );
  }

  async process(job: Job<{ orderId?: string }>): Promise<boolean | string[]> {
    switch (job.name) {
      case JOB_RELEASE:
        return this.release.releaseIfExpired(job.data.orderId!);
      case JOB_SWEEP:
        return this.release.sweepExpired();
      default:
        throw new Error(`Job desconocido: ${job.name}`);
    }
  }
}
