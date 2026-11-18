import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { EnvironmentVariables } from '../core/config/env.validation';
import { QUEUE_NOTIFICATIONS } from '../notifications/notification.types';
import { QUEUE_OPERATIONAL_ALERTS } from '../operational-alerts/operational-alerts.constants';
import { QUEUE_ORDERS } from '../orders/orders.constants';

const ADMIN_QUEUES_PATH = '/admin/queues';
const MONITORED_QUEUES = [
  QUEUE_ORDERS,
  QUEUE_NOTIFICATIONS,
  QUEUE_OPERATIONAL_ALERTS,
];

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Compara contra un buffer del mismo largo que el esperado: una longitud distinta no debe
  // filtrarse por timing (por eso no se compara bufA.length !== bufB.length directamente aquí).
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufB, bufB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function basicAuth(user: string, password: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const reqUser = sep === -1 ? decoded : decoded.slice(0, sep);
      const reqPassword = sep === -1 ? '' : decoded.slice(sep + 1);
      if (
        timingSafeEqualString(reqUser, user) &&
        timingSafeEqualString(reqPassword, password)
      ) {
        next();
        return;
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    res.status(401).send('Unauthorized');
  };
}

/**
 * Monta Bull Board en /admin/queues, protegido con HTTP Basic Auth (no el JWT de la app: Bull
 * Board es navegación de browser, no fetch con Authorization header). Solo se llama desde
 * main.ts — nunca desde configureApp/el harness e2e — para no obligar a cada test de la suite a
 * registrar las 3 colas que Bull Board necesita.
 */
export function mountQueuesAdmin(app: NestExpressApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const user = config.get('ADMIN_QUEUES_USER', { infer: true });
  const password = config.get('ADMIN_QUEUES_PASSWORD', { infer: true });
  if (!user || !password) {
    throw new Error(
      'ADMIN_QUEUES_USER y ADMIN_QUEUES_PASSWORD son obligatorias para montar /admin/queues',
    );
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(ADMIN_QUEUES_PATH);
  createBullBoard({
    queues: MONITORED_QUEUES.map(
      (name) => new BullMQAdapter(app.get<Queue>(getQueueToken(name))),
    ),
    serverAdapter,
  });

  app.use(
    ADMIN_QUEUES_PATH,
    basicAuth(user, password),
    serverAdapter.getRouter(),
  );
}
