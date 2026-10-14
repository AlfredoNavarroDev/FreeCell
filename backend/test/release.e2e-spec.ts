import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type Job, type Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { QUEUE_NOTIFICATIONS } from '../src/notifications/notification.types';
import { OrderReleaseService } from '../src/orders/order-release.service';
import {
  JOB_RELEASE,
  JOB_SWEEP,
  orderCreatedKey,
  QUEUE_ORDERS,
  releaseJobId,
} from '../src/orders/orders.constants';
import { OrdersProcessor } from '../src/orders/orders.processor';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Liberación de reservas', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  let release: OrderReleaseService;
  let ordersQueue: Queue;

  const createOrder = async (): Promise<string> => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, { stock: 1 });
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set(
        'Authorization',
        `Bearer ${app.get(JwtService).sign({ sub: user.id, role: user.role })}`,
      )
      .send({ currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] })
      .expect(201);
    return res.body.id as string;
  };
  const expire = (orderId: string) =>
    ds.query(
      `UPDATE orders SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`,
      [orderId],
    );
  const orderStatus = async (orderId: string) => {
    const [row]: { status: string; cancelReason: string | null }[] =
      await ds.query(
        `SELECT status, "cancelReason" FROM orders WHERE id = $1`,
        [orderId],
      );
    return row;
  };
  const count = async (sql: string) => {
    const [{ count }]: { count: string }[] = await ds.query(sql);
    return Number(count);
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    release = app.get(OrderReleaseService);
    ordersQueue = app.get<Queue>(getQueueToken(QUEUE_ORDERS));
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('crear un pedido programa la liberación y la notificación', async () => {
    const orderId = await createOrder();
    const job = await ordersQueue.getJob(releaseJobId(orderId));
    expect(job?.name).toBe(JOB_RELEASE);
    expect(job?.opts.delay).toBeGreaterThanOrEqual(30 * 60_000);
    const notifications = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
    expect(await notifications.getJob(orderCreatedKey(orderId))).toBeDefined();
  });

  it('el job libera un pedido vencido y lo audita', async () => {
    const orderId = await createOrder();
    await expire(orderId);

    await expect(release.releaseIfExpired(orderId)).resolves.toBe(true);

    expect(await orderStatus(orderId)).toEqual({
      status: 'CANCELLED',
      cancelReason: 'EXPIRED',
    });
    expect(
      await count(
        `SELECT count(*) FROM license_items WHERE status = 'AVAILABLE'`,
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*) FROM audit_logs WHERE action = 'order.expired'`,
      ),
    ).toBe(1);
  });

  it('el job no libera un pedido que aún no vence', async () => {
    const orderId = await createOrder();
    await expect(release.releaseIfExpired(orderId)).resolves.toBe(false);
    expect((await orderStatus(orderId)).status).toBe('PENDING_PAYMENT');
  });

  it('el job nunca libera un pedido IN_REVIEW (regla 3)', async () => {
    const orderId = await createOrder();
    await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [
      orderId,
    ]);
    await expire(orderId);

    await expect(release.releaseIfExpired(orderId)).resolves.toBe(false);
    expect(
      await count(
        `SELECT count(*) FROM license_items WHERE status = 'RESERVED'`,
      ),
    ).toBe(1);
  });

  it('el barrido libera un pedido cuyo job se perdió', async () => {
    const orderId = await createOrder();
    await ordersQueue.obliterate({ force: true });
    await expire(orderId);

    await expect(release.sweepExpired()).resolves.toEqual([orderId]);
    expect((await orderStatus(orderId)).status).toBe('CANCELLED');
  });

  it('job y barrido en paralelo liberan una sola vez', async () => {
    const orderId = await createOrder();
    await expire(orderId);

    await Promise.all([
      release.releaseIfExpired(orderId),
      release.sweepExpired(),
    ]);

    expect((await orderStatus(orderId)).status).toBe('CANCELLED');
    expect(
      await count(
        `SELECT count(*) FROM audit_logs WHERE action = 'order.expired'`,
      ),
    ).toBe(1);
  });

  it('el processor enruta los jobs y registra el barrido periódico', async () => {
    const processor = new OrdersProcessor(release, ordersQueue);
    const orderId = await createOrder();
    await expire(orderId);

    await expect(
      processor.process({ name: JOB_RELEASE, data: { orderId } } as Job),
    ).resolves.toBe(true);
    await expect(
      processor.process({ name: 'desconocido', data: {} } as Job),
    ).rejects.toThrow('Job desconocido: desconocido');

    await processor.onApplicationBootstrap();
    const schedulers = await ordersQueue.getJobSchedulers();
    expect(schedulers.map((s) => s.key)).toContain(JOB_SWEEP);
  });
});
