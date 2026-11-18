import * as Sentry from '@sentry/nextjs';

// Sin NEXT_PUBLIC_SENTRY_DSN, Sentry.init trata el DSN vacío como "desactivado" (RNF-OBS-04).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
