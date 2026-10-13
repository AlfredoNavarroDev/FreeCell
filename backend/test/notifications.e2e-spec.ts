import { getQueueToken } from '@nestjs/bullmq';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { NOTIFICATION_CHANNEL } from '../src/notifications/channels/notification-channel';
import type { NotificationChannel } from '../src/notifications/channels/notification-channel';
import { maskEmail } from '../src/notifications/channels/log.channel';
import { NotificationSender } from '../src/notifications/notification-sender.service';
import {
  NotificationJob,
  QUEUE_NOTIFICATIONS,
} from '../src/notifications/notification.types';
import { NotificationsDeliveryModule } from '../src/notifications/notifications-delivery.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createTestApp, resetState } from './utils/test-app';

class FakeChannel implements NotificationChannel {
  readonly name = 'fake';
  sent: NotificationJob[] = [];
  failNext = 0;

  send(job: NotificationJob): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('Proveedor caído'));
    }
    this.sent.push(job);
    return Promise.resolve();
  }
}

const job = (key = 'order-created-test'): NotificationJob => ({
  key,
  template: 'order-created',
  recipient: 'cliente@test.pe',
  data: { orderNumber: 1001 },
});

describe('Notificaciones', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  const channel = new FakeChannel();

  const logCount = async () => {
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM notification_logs`,
    );
    return Number(count);
  };

  beforeAll(async () => {
    app = await createTestApp({
      imports: [NotificationsModule, NotificationsDeliveryModule],
      configure: (builder) =>
        builder.overrideProvider(NOTIFICATION_CHANNEL).useValue(channel),
    });
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
    channel.sent = [];
    channel.failNext = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('procesar dos veces el mismo job envía una sola vez', async () => {
    const sender = app.get(NotificationSender);
    await expect(sender.handle(job())).resolves.toBe('sent');
    await expect(sender.handle(job())).resolves.toBe('skipped');
    expect(channel.sent).toHaveLength(1);
    expect(await logCount()).toBe(1);
  });

  it('si el envío falla libera la huella y el reintento envía', async () => {
    const sender = app.get(NotificationSender);
    channel.failNext = 1;
    await expect(sender.handle(job())).rejects.toThrow('Proveedor caído');
    expect(await logCount()).toBe(0);
    await expect(sender.handle(job())).resolves.toBe('sent');
    expect(channel.sent).toHaveLength(1);
    expect(await logCount()).toBe(1);
  });

  it('encolar dos veces la misma key deja un solo job', async () => {
    const notifications = app.get(NotificationsService);
    await notifications.enqueue(job('order-created-dup'));
    await notifications.enqueue(job('order-created-dup'));
    const queue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
    expect(await queue.getJob('order-created-dup')).toBeDefined();
    expect(await queue.getJobCountByTypes('waiting')).toBe(1);
  });

  it('enmascara el correo en el canal de log', () => {
    expect(maskEmail('juan@correo.pe')).toBe('j***@correo.pe');
    expect(maskEmail('sin-arroba')).toBe('***');
  });
});
