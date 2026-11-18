import * as Sentry from '@sentry/nestjs';

/** Sin DSN, Sentry.init() nunca se llama y el SDK queda inerte (RNF-OBS-04). */
export function initSentryIfConfigured(
  dsn: string | undefined,
  environment: string | undefined,
): void {
  if (!dsn) {
    return;
  }
  Sentry.init({ dsn, environment });
}
