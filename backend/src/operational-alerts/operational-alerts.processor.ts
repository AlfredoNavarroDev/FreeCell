import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { OperationalAlertsService } from './operational-alerts.service';
import {
  CHECK_EVERY_MS,
  JOB_FAILED_JOBS_CHECK,
  JOB_LOW_STOCK_CHECK,
  JOB_ORDER_REVIEW_SLA_CHECK,
  QUEUE_OPERATIONAL_ALERTS,
} from './operational-alerts.constants';

@Processor(QUEUE_OPERATIONAL_ALERTS)
export class OperationalAlertsProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    private readonly alerts: OperationalAlertsService,
    @InjectQueue(QUEUE_OPERATIONAL_ALERTS) private readonly queue: Queue,
  ) {
    super();
  }

  /** Registra (o actualiza) ambos barridos repetibles. upsert evita duplicarlos entre reinicios. */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      JOB_LOW_STOCK_CHECK,
      { every: CHECK_EVERY_MS },
      { name: JOB_LOW_STOCK_CHECK },
    );
    await this.queue.upsertJobScheduler(
      JOB_ORDER_REVIEW_SLA_CHECK,
      { every: CHECK_EVERY_MS },
      { name: JOB_ORDER_REVIEW_SLA_CHECK },
    );
    await this.queue.upsertJobScheduler(
      JOB_FAILED_JOBS_CHECK,
      { every: CHECK_EVERY_MS },
      { name: JOB_FAILED_JOBS_CHECK },
    );
  }

  async process(job: Job): Promise<number> {
    switch (job.name) {
      case JOB_LOW_STOCK_CHECK:
        return this.alerts.checkLowStock();
      case JOB_ORDER_REVIEW_SLA_CHECK:
        return this.alerts.checkOrderReviewSla();
      case JOB_FAILED_JOBS_CHECK:
        return this.alerts.checkFailedJobs();
      default:
        throw new Error(`Job desconocido: ${job.name}`);
    }
  }
}
