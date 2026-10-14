import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NOTIFICATION_CHANNEL } from './channels/notification-channel';
import type { NotificationChannel } from './channels/notification-channel';
import type { NotificationJob } from './notification.types';

@Injectable()
export class NotificationSender {
  constructor(
    private readonly ds: DataSource,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  /**
   * 1) Reclama la huella en notification_logs (key única). Si ya existe, el mensaje ya salió.
   * 2) Envía. Si falla, libera la huella para que el reintento de BullMQ pueda enviarlo.
   */
  async handle(job: NotificationJob): Promise<'sent' | 'skipped'> {
    const claimed: { id: string }[] = await this.ds.query(
      `INSERT INTO notification_logs (key, channel, recipient, template)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING
       RETURNING id`,
      [job.key, this.channel.name, job.recipient, job.template],
    );
    if (claimed.length === 0) {
      return 'skipped';
    }

    try {
      await this.channel.send(job);
      return 'sent';
    } catch (error) {
      await this.ds.query(`DELETE FROM notification_logs WHERE key = $1`, [
        job.key,
      ]);
      throw error;
    }
  }
}
