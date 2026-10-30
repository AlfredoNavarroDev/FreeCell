import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { type Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  LicenseStatus,
  OrderStatus,
  PaymentStatus,
  Role,
} from '../src/database/enums';
import { type User } from '../src/database/entities';
import {
  licenseDeliveredKey,
  paymentRejectedKey,
  QUEUE_ORDERS,
  releaseJobId,
} from '../src/orders/orders.constants';
import { QUEUE_NOTIFICATIONS } from '../src/notifications/notification.types';
import {
  createCatalog,
  createPaymentMethod,
  createUser,
  insertOrder,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

async function insertPayment(
  ds: DataSource,
  input: {
    orderId: string;
    paymentMethodId: string;
    status?: PaymentStatus;
    operationNumber?: string;
    createdAt?: Date;
  },
): Promise<string> {
  const [{ id }]: { id: string }[] = await ds.query(
    `INSERT INTO payments
       ("orderId", "paymentMethodId", status, "operationNumber", "proofKey", "proofHash", "legalDeclarationAcceptedAt", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
     RETURNING id`,
    [
      input.orderId,
      input.paymentMethodId,
      input.status ?? PaymentStatus.PENDING,
      input.operationNumber ?? `op-${randomUUID()}`,
      `proofs/${input.orderId}/comprobante.png`,
      randomBytes(32).toString('hex'),
      input.createdAt ?? new Date(),
    ],
  );
  return id;
}

describe('/admin/payments', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/payments', () => {
    it('rechaza a un cliente (403)', async () => {
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const res = await request(app.getHttpServer())
        .get('/admin/payments')
        .set('Authorization', `Bearer ${tokenFor(customer)}`);
      expect(res.status).toBe(403);
    });

    it('responde 401 sin sesión', async () => {
      const res = await request(app.getHttpServer()).get('/admin/payments');
      expect(res.status).toBe(401);
    });

    it('lista pendientes ordenados por antigüedad, con URL firmada del comprobante', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const customer = await createUser(ds);
      const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
      const catalog = await createCatalog(ds, {
        stock: 2,
        prices: { PEN: 1000 },
      });

      const older = await insertOrder(ds, {
        userId: customer.id,
        currency: 'PEN',
        lines: [
          {
            planId: catalog.plan.id,
            unitPriceCents: 1000,
            licenseId: catalog.licenseIds[0],
          },
        ],
        status: OrderStatus.IN_REVIEW,
      });
      const newer = await insertOrder(ds, {
        userId: customer.id,
        currency: 'PEN',
        lines: [
          {
            planId: catalog.plan.id,
            unitPriceCents: 1000,
            licenseId: catalog.licenseIds[1],
          },
        ],
        status: OrderStatus.IN_REVIEW,
      });
      await insertPayment(ds, {
        orderId: older.orderId,
        paymentMethodId: method.id,
        createdAt: new Date(Date.now() - 60_000),
      });
      await insertPayment(ds, {
        orderId: newer.orderId,
        paymentMethodId: method.id,
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get('/admin/payments?status=PENDING')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        items: {
          orderId: string;
          proofUrl: string;
          totalCents: number;
          currency: string;
        }[];
        total: number;
      };
      expect(body.items.map((i) => i.orderId)).toEqual([
        older.orderId,
        newer.orderId,
      ]);
      expect(body.items[0].proofUrl).toContain('X-Amz-Signature');
      expect(body.items[0].totalCents).toBe(1000);
      expect(body.items[0].currency).toBe('PEN');
      expect(body.total).toBe(2);
    });
  });

  describe('POST /admin/payments/:id/approve', () => {
    async function setupPendingReview() {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const customer = await createUser(ds);
      const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
      const catalog = await createCatalog(ds, {
        stock: 1,
        prices: { PEN: 1000 },
      });
      const { orderId } = await insertOrder(ds, {
        userId: customer.id,
        currency: 'PEN',
        lines: [
          {
            planId: catalog.plan.id,
            unitPriceCents: 1000,
            licenseId: catalog.licenseIds[0],
          },
        ],
        status: OrderStatus.IN_REVIEW,
      });
      const paymentId = await insertPayment(ds, {
        orderId,
        paymentMethodId: method.id,
      });
      return { admin, customer, catalog, orderId, paymentId };
    }

    it('aprueba: licencia SOLD, pedido DELIVERED, pago APPROVED, auditoría y notificación', async () => {
      const { admin, catalog, orderId, paymentId } = await setupPendingReview();

      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/approve`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as { status: string };
      expect(body.status).toBe(OrderStatus.DELIVERED);

      const [license]: { status: string }[] = await ds.query(
        `SELECT status FROM license_items WHERE id = $1`,
        [catalog.licenseIds[0]],
      );
      expect(license.status).toBe(LicenseStatus.SOLD);

      const [payment]: { status: string; reviewedById: string }[] =
        await ds.query(
          `SELECT status, "reviewedById" FROM payments WHERE id = $1`,
          [paymentId],
        );
      expect(payment.status).toBe(PaymentStatus.APPROVED);
      expect(payment.reviewedById).toBe(admin.id);

      const logs: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity = 'payment' AND "entityId" = $1`,
        [paymentId],
      );
      expect(logs.map((l) => l.action)).toContain('payment.approved');

      const notifications = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
      expect(
        await notifications.getJob(licenseDeliveredKey(orderId)),
      ).toBeDefined();
    });

    it('rechaza a un cliente (403)', async () => {
      const { customer, paymentId } = await setupPendingReview();
      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/approve`)
        .set('Authorization', `Bearer ${tokenFor(customer)}`);
      expect(res.status).toBe(403);
    });

    it('responde 404 si el pago no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .post(`/admin/payments/00000000-0000-0000-0000-000000000000/approve`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      expect(res.status).toBe(404);
    });

    it('es idempotente: aprobar dos veces no falla y el pedido sigue DELIVERED', async () => {
      const { admin, paymentId } = await setupPendingReview();
      await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/approve`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/approve`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as { status: string };
      expect(body.status).toBe(OrderStatus.DELIVERED);
    });

    it('responde 409 si el pago ya fue rechazado', async () => {
      const { admin, paymentId } = await setupPendingReview();
      await ds.query(`UPDATE payments SET status = 'REJECTED' WHERE id = $1`, [
        paymentId,
      ]);

      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/approve`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(409);
    });

    it('concurrencia: dos aprobaciones simultáneas del mismo pago no rompen nada', async () => {
      const { admin, paymentId } = await setupPendingReview();
      const approve = () =>
        request(app.getHttpServer())
          .post(`/admin/payments/${paymentId}/approve`)
          .set('Authorization', `Bearer ${tokenFor(admin)}`);

      const [a, b] = await Promise.all([approve(), approve()]);
      expect([a.status, b.status]).toEqual([200, 200]);
    });
  });

  describe('POST /admin/payments/:id/reject', () => {
    async function setupPendingReview() {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const customer = await createUser(ds);
      const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
      const catalog = await createCatalog(ds, {
        stock: 1,
        prices: { PEN: 1000 },
      });
      const { orderId } = await insertOrder(ds, {
        userId: customer.id,
        currency: 'PEN',
        lines: [
          {
            planId: catalog.plan.id,
            unitPriceCents: 1000,
            licenseId: catalog.licenseIds[0],
          },
        ],
        status: OrderStatus.IN_REVIEW,
      });
      const paymentId = await insertPayment(ds, {
        orderId,
        paymentMethodId: method.id,
      });
      return { admin, customer, catalog, method, orderId, paymentId };
    }

    it('1er rechazo: pedido vuelve a PENDING_PAYMENT con plazo extra, pago REJECTED, notifica', async () => {
      const { admin, orderId, paymentId } = await setupPendingReview();

      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/reject`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'ILLEGIBLE_PROOF' });

      expect(res.status).toBe(200);
      const body = res.body as {
        status: string;
        expiresAt: string;
        paymentRejectionReason: string;
      };
      expect(body.status).toBe(OrderStatus.PENDING_PAYMENT);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(body.paymentRejectionReason).toBe('Comprobante ilegible');

      const logs: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity = 'payment' AND "entityId" = $1`,
        [paymentId],
      );
      expect(logs.map((l) => l.action)).toContain('payment.rejected');

      const notifications = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
      expect(
        await notifications.getJob(paymentRejectedKey(paymentId)),
      ).toBeDefined();

      const ordersQueue = app.get<Queue>(getQueueToken(QUEUE_ORDERS));
      const job = await ordersQueue.getJob(releaseJobId(orderId));
      expect(job).toBeDefined();
      expect(job!.opts.delay).toBeGreaterThan(0);
    });

    it('3er rechazo cancela el pedido y libera la licencia', async () => {
      const { admin, catalog, method, orderId, paymentId } =
        await setupPendingReview();

      await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/reject`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'AMOUNT_MISMATCH' })
        .expect(200);

      const secondPaymentId = await insertPayment(ds, {
        orderId,
        paymentMethodId: method.id,
      });
      await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [
        orderId,
      ]);
      await request(app.getHttpServer())
        .post(`/admin/payments/${secondPaymentId}/reject`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'AMOUNT_MISMATCH' })
        .expect(200);

      const thirdPaymentId = await insertPayment(ds, {
        orderId,
        paymentMethodId: method.id,
      });
      await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [
        orderId,
      ]);

      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${thirdPaymentId}/reject`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'OPERATION_NOT_FOUND' });

      expect(res.status).toBe(200);
      const body = res.body as { status: string };
      expect(body.status).toBe(OrderStatus.CANCELLED);

      const [license]: { status: string }[] = await ds.query(
        `SELECT status FROM license_items WHERE id = $1`,
        [catalog.licenseIds[0]],
      );
      expect(license.status).toBe(LicenseStatus.AVAILABLE);
    });

    it('responde 400 si el motivo no es uno de los predefinidos', async () => {
      const { admin, paymentId } = await setupPendingReview();
      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/reject`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'PORQUE_SI' });
      expect(res.status).toBe(400);
    });

    it('rechaza a un cliente (403)', async () => {
      const { customer, paymentId } = await setupPendingReview();
      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/reject`)
        .set('Authorization', `Bearer ${tokenFor(customer)}`)
        .send({ reason: 'AMOUNT_MISMATCH' });
      expect(res.status).toBe(403);
    });

    it('responde 404 si el pago no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .post(`/admin/payments/00000000-0000-0000-0000-000000000000/reject`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'AMOUNT_MISMATCH' });
      expect(res.status).toBe(404);
    });

    it('responde 409 si el pago ya fue aprobado', async () => {
      const { admin, paymentId } = await setupPendingReview();
      await ds.query(`UPDATE payments SET status = 'APPROVED' WHERE id = $1`, [
        paymentId,
      ]);

      const res = await request(app.getHttpServer())
        .post(`/admin/payments/${paymentId}/reject`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'AMOUNT_MISMATCH' });

      expect(res.status).toBe(409);
    });
  });
});
