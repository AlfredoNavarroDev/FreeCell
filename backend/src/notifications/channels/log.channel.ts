import { Injectable, Logger } from '@nestjs/common';
import type { NotificationJob } from '../notification.types';
import type { NotificationChannel } from './notification-channel';

/** `juan@correo.pe` → `j***@correo.pe`. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
}

/** Canal de Fundaciones: solo registra en el log, con el destinatario enmascarado. */
@Injectable()
export class LogChannel implements NotificationChannel {
  readonly name = 'log';
  private readonly logger = new Logger('Notifications');

  send(job: NotificationJob): Promise<void> {
    this.logger.log(
      {
        key: job.key,
        template: job.template,
        recipient: maskEmail(job.recipient),
      },
      'Notificación enviada (canal de log)',
    );
    return Promise.resolve();
  }
}
