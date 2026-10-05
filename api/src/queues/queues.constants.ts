export const QUEUE_RESERVATIONS = 'reservations';
export const QUEUE_NOTIFICATIONS = 'notifications';

/** Tiempo que se mantiene reservada una licencia mientras el cliente paga. */
export const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;

/** Cada cuánto el "barrido" limpia reservas vencidas por si algún trabajo se perdió. */
export const SWEEP_EVERY_MS = 5 * 60 * 1000;
