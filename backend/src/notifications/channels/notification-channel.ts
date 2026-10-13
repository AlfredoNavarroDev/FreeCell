import type { NotificationJob } from '../notification.types';

export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** Proveedor de envío. Sprint 3 agrega Resend (correo) y enlaces wa.me. */
export interface NotificationChannel {
  readonly name: string;
  send(job: NotificationJob): Promise<void>;
}
