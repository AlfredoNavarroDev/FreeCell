import * as Sentry from '@sentry/nextjs';

// Sin SENTRY_DSN, Sentry.init trata el DSN vacío como "desactivado" (RNF-OBS-04).
export function register(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
  });
}

export const onRequestError = Sentry.captureRequestError;
