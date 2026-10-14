export const QUEUE_ORDERS = 'orders';
export const JOB_RELEASE = 'release';
export const JOB_SWEEP = 'sweep-expired';

/** Red de seguridad: libera reservas vencidas aunque Redis haya perdido algún job. */
export const SWEEP_EVERY_MS = 5 * 60_000;
/** El job de liberación corre un poco después del vencimiento para no llegar antes de tiempo. */
export const RELEASE_DELAY_MARGIN_MS = 2_000;
export const DEFAULT_RESERVATION_TTL_MINUTES = 30;

export const releaseJobId = (orderId: string): string => `release-${orderId}`;
export const orderCreatedKey = (orderId: string): string =>
  `order-created-${orderId}`;
