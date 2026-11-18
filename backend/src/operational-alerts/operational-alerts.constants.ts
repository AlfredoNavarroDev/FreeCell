export const QUEUE_OPERATIONAL_ALERTS = 'operational-alerts';
export const JOB_LOW_STOCK_CHECK = 'low-stock-check';
export const JOB_ORDER_REVIEW_SLA_CHECK = 'order-review-sla-check';
export const JOB_FAILED_JOBS_CHECK = 'failed-jobs-check';

/** Cada cuánto corre el barrido repetible (RF-ADM-26, D19). */
export const CHECK_EVERY_MS = 60 * 60 * 1000;

function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Una key por día (UTC): mientras el plan siga bajo el umbral, `notification_logs` deja re-alertar
 * al día siguiente, pero nunca dos veces el mismo día (D19/RF-ADM-26: cadencia diaria, no spam).
 */
export function lowStockKey(
  planId: string,
  adminId: string,
  now?: Date,
): string {
  return `low-stock-${planId}-${adminId}-${todayUtc(now)}`;
}

export function orderReviewSlaKey(
  orderId: string,
  adminId: string,
  now?: Date,
): string {
  return `order-review-sla-${orderId}-${adminId}-${todayUtc(now)}`;
}

export function failedJobsKey(
  queueName: string,
  adminId: string,
  now?: Date,
): string {
  return `failed-jobs-${queueName}-${adminId}-${todayUtc(now)}`;
}
