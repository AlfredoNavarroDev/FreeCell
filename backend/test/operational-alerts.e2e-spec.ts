import { getQueueToken } from '@nestjs/bullmq';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { parseRedisUrl } from '../src/core/redis/redis.module';
import { OrderStatus, PaymentStatus, Role } from '../src/database/enums';
import {
  failedJobsKey,
  lowStockKey,
  orderReviewSlaKey,
  JOB_FAILED_JOBS_CHECK,
  JOB_LOW_STOCK_CHECK,
  JOB_ORDER_REVIEW_SLA_CHECK,
  QUEUE_OPERATIONAL_ALERTS,
} from '../src/operational-alerts/operational-alerts.constants';
import { QUEUE_NOTIFICATIONS } from '../src/notifications/notification.types';
import { QUEUE_ORDERS } from '../src/orders/orders.constants';
import { OperationalAlertsModule } from '../src/operational-alerts/operational-alerts.module';
import { OperationalAlertsProcessor } from '../src/operational-alerts/operational-alerts.processor';
import { OperationalAlertsService } from '../src/operational-alerts/operational-alerts.service';
import { createCatalog, createUser, insertOrder } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

async function insertPayment(
  ds: DataSource,
  input: {
    orderId: string;
    status?: PaymentStatus;
    createdAt?: Date;
  },
): Promise<string> {
  const paymentMethod: { id: string }[] = await ds.query(
    `INSERT INTO payment_methods (code, name, kind, currencies, instructions)
     VALUES ($1, '[Método de prueba]', 'WALLET', ARRAY['PEN'], '{}') RETURNING id`,
    [`pm-${randomUUID().slice(0, 8)}`],
  );
  const [{ id }]: { id: string }[] = await ds.query(
    `INSERT INTO payments
       ("orderId", "paymentMethodId", status, "operationNumber", "proofKey", "proofHash", "legalDeclarationAcceptedAt", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
     RETURNING id`,
    [
      input.orderId,
      paymentMethod[0].id,
      input.status ?? PaymentStatus.PENDING,
      `op-${randomUUID()}`,
      `proofs/${input.orderId}/comprobante.png`,
      randomBytes(32).toString('hex'),
      input.createdAt ?? new Date(),
    ],
  );
  return id;
}

/** Procesa un job real que siempre falla, para dejarlo en estado `failed` de verdad (no simulado). */
async function failAJob(queueName: string): Promise<void> {
  const worker = new Worker(
    queueName,
    () => {
      throw new Error('boom');
    },
    { connection: parseRedisUrl(process.env.REDIS_URL!) },
  );
  try {
    const failed = new Promise<void>((resolve) =>
      worker.once('failed', () => resolve()),
    );
    const producer = new Queue(queueName, {
      connection: parseRedisUrl(process.env.REDIS_URL!),
    });
    await producer.add('x', {});
    await failed;
    await producer.close();
  } finally {
    await worker.close();
  }
}

describe('Alertas operativas (low-stock-check, SLA 24h IN_REVIEW)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  let service: OperationalAlertsService;
  let queue: Queue;
  let notificationsQueue: Queue;

  beforeAll(async () => {
    app = await createTestApp({ imports: [OperationalAlertsModule] });
    ds = app.get(DataSource);
    service = app.get(OperationalAlertsService);
    queue = app.get<Queue>(getQueueToken(QUEUE_OPERATIONAL_ALERTS));
    notificationsQueue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('checkLowStock encola una alerta por cada admin cuando un plan cae bajo el umbral', async () => {
    const admin1 = await createUser(ds, { role: Role.ADMIN });
    const admin2 = await createUser(ds, { role: Role.ADMIN });
    await createUser(ds); // cliente: no debe recibir nada
    const { plan } = await createCatalog(ds, {
      stock: 1,
      lowStockThreshold: 5,
    });

    await expect(service.checkLowStock()).resolves.toBe(2);

    const key1 = lowStockKey(plan.id, admin1.id);
    const key2 = lowStockKey(plan.id, admin2.id);
    const job1 = await notificationsQueue.getJob(key1);
    const job2 = await notificationsQueue.getJob(key2);
    expect(job1?.data).toMatchObject({
      template: 'low-stock-alert',
      recipient: admin1.email,
    });
    expect(job2?.data).toMatchObject({
      template: 'low-stock-alert',
      recipient: admin2.email,
    });
  });

  it('checkLowStock no alerta un plan con stock saludable', async () => {
    await createUser(ds, { role: Role.ADMIN });
    const { plan } = await createCatalog(ds, {
      stock: 10,
      lowStockThreshold: 5,
    });

    await expect(service.checkLowStock()).resolves.toBe(0);
    expect(
      await notificationsQueue.getJob(lowStockKey(plan.id, 'cualquiera')),
    ).toBeUndefined();
  });

  it('checkLowStock llamado dos veces el mismo día no duplica el job en la cola', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const { plan } = await createCatalog(ds, {
      stock: 0,
      lowStockThreshold: 5,
    });

    await expect(service.checkLowStock()).resolves.toBe(1);
    await expect(service.checkLowStock()).resolves.toBe(1);

    const key = lowStockKey(plan.id, admin.id);
    expect(await notificationsQueue.getJob(key)).toBeDefined();
    expect(await notificationsQueue.getJobCountByTypes('waiting')).toBe(1);
  });

  it('checkOrderReviewSla alerta un pedido IN_REVIEW con pago pendiente de más de 24h', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const customer = await createUser(ds);
    const { plan } = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: customer.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });
    await insertPayment(ds, {
      orderId,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    await expect(service.checkOrderReviewSla()).resolves.toBe(1);

    const job = await notificationsQueue.getJob(
      orderReviewSlaKey(orderId, admin.id),
    );
    expect(job?.data).toMatchObject({
      template: 'order-review-sla',
      recipient: admin.email,
    });
  });

  it('checkOrderReviewSla no alerta un pedido IN_REVIEW con pago reciente', async () => {
    await createUser(ds, { role: Role.ADMIN });
    const customer = await createUser(ds);
    const { plan } = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: customer.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });
    await insertPayment(ds, { orderId });

    await expect(service.checkOrderReviewSla()).resolves.toBe(0);
  });

  it('checkFailedJobs alerta cuando una cola tiene jobs en failed', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    await failAJob(QUEUE_ORDERS);

    await expect(service.checkFailedJobs()).resolves.toBe(1);

    const job = await notificationsQueue.getJob(
      failedJobsKey(QUEUE_ORDERS, admin.id),
    );
    expect(job?.data).toMatchObject({
      template: 'failed-jobs-alert',
      recipient: admin.email,
    });
  }, 15000);

  it('checkFailedJobs no alerta si ninguna cola tiene jobs en failed', async () => {
    await createUser(ds, { role: Role.ADMIN });
    await expect(service.checkFailedJobs()).resolves.toBe(0);
  });

  it('el processor enruta los jobs y registra los schedulers periódicos', async () => {
    const processor = new OperationalAlertsProcessor(service, queue);

    await expect(
      processor.process({ name: JOB_LOW_STOCK_CHECK, data: {} } as Job),
    ).resolves.toBe(0);
    await expect(
      processor.process({ name: JOB_ORDER_REVIEW_SLA_CHECK, data: {} } as Job),
    ).resolves.toBe(0);
    await expect(
      processor.process({ name: JOB_FAILED_JOBS_CHECK, data: {} } as Job),
    ).resolves.toBe(0);
    await expect(
      processor.process({ name: 'desconocido', data: {} } as Job),
    ).rejects.toThrow('Job desconocido: desconocido');

    await processor.onApplicationBootstrap();
    const schedulers = await queue.getJobSchedulers();
    const keys = schedulers.map((s) => s.key);
    expect(keys).toContain(JOB_LOW_STOCK_CHECK);
    expect(keys).toContain(JOB_ORDER_REVIEW_SLA_CHECK);
    expect(keys).toContain(JOB_FAILED_JOBS_CHECK);
  });

  it('las keys son estables por día: distintos días producen keys distintas', () => {
    const d1 = new Date('2026-11-15T10:00:00Z');
    const d2 = new Date('2026-11-16T10:00:00Z');
    expect(lowStockKey('plan-1', 'admin-1', d1)).not.toBe(
      lowStockKey('plan-1', 'admin-1', d2),
    );
    expect(lowStockKey('plan-1', 'admin-1', d1)).toBe(
      lowStockKey('plan-1', 'admin-1', d1),
    );
  });
});
