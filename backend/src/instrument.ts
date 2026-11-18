// Debe ser el primer import de main.ts: Sentry necesita instrumentar antes de que
// cualquier otro módulo (TypeORM, Express, etc.) termine de cargar.
import 'dotenv/config';
import { initSentryIfConfigured } from './observability/sentry-init';

initSentryIfConfigured(process.env.SENTRY_DSN, process.env.NODE_ENV);
