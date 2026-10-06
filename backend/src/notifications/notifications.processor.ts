import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { NotificationLog } from '../database/entities';
import { QUEUE_NOTIFICATIONS } from '../queues/queues.constants';
import { NotificationJob } from './notifications.service';

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(@InjectRepository(NotificationLog) private readonly logs: Repository<NotificationLog>) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const key = String(job.id);
    const { channel, recipient, template } = job.data;

    // 1) Reservar la "huella" del mensaje. Si ya existe, es un reintento de algo ya enviado.
    const claimed = await this.logs
      .createQueryBuilder()
      .insert()
      .values({ key, channel, recipient, template })
      .orIgnore()
      .execute();
    if (!claimed.identifiers[0]?.id) {
      this.logger.warn(`Mensaje ${key} ya enviado, se omite`);
      return;
    }

    // 2) Enviar. Si falla, se libera la huella para que el reintento pueda volver a intentarlo.
    try {
      await this.send(job.data);
    } catch (error) {
      await this.logs.delete({ key });
      throw error;
    }
  }

  /** Sprint 3: aquí se conecta el proveedor real (correo / WhatsApp). */
  private async send(job: NotificationJob): Promise<void> {
    this.logger.log(`[${job.channel}] ${job.template} -> ${job.recipient}`);
  }
}
