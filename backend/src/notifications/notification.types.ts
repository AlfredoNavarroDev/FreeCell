export const QUEUE_NOTIFICATIONS = 'notifications';

export type NotificationTemplate = 'order-created' | 'email-verification';

export interface NotificationJob {
  /** Identifica el mensaje de forma única (p. ej. `order-created-<orderId>`). También es el jobId. */
  key: string;
  template: NotificationTemplate;
  recipient: string;
  /** Datos para la plantilla. Nunca claves de licencia ni tokens. */
  data: Record<string, string | number>;
}
