import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OrderStatus, PaymentStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import {
  createCatalog,
  createPaymentMethod,
  createUser,
  insertOrder,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('GET /orders y GET /orders/:id enriquecido', () => {
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

  it('lista solo los pedidos propios, paginados, más recientes primero', async () => {
    const user = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 3 });
    const mine1 = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });
    const mine2 = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });
    await insertOrder(ds, {
      userId: stranger.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    const body = res.body as { items: { id: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.items.map((o) => o.id).sort()).toEqual(
      [mine1.orderId, mine2.orderId].sort(),
    );
  });

  it('filtra por status', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .get('/orders?status=IN_REVIEW')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    const body = res.body as { items: { status: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe(OrderStatus.IN_REVIEW);
  });

  it('el detalle incluye el estado del pago y la línea de seguimiento', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });
    const reviewedAt = new Date();
    await ds.query(
      `INSERT INTO payments ("orderId", "paymentMethodId", "operationNumber", "proofKey", "proofHash", "legalDeclarationAcceptedAt", status, "reviewedAt")
       VALUES ($1, $2, 'op-1', 'proofs/x.png', md5(random()::text) || md5(random()::text), now(), $3, $4)`,
      [orderId, method.id, PaymentStatus.APPROVED, reviewedAt],
    );

    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      paymentStatus: string;
      tracking: { createdAt: string; paymentApprovedAt: string | null };
    };
    expect(body.paymentStatus).toBe(PaymentStatus.APPROVED);
    expect(body.tracking.paymentApprovedAt).not.toBeNull();
    expect(body.tracking.createdAt).toBeTruthy();
  });

  it('el detalle sin pago asociado trae paymentStatus null', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    const body = res.body as { paymentStatus: string | null };
    expect(body.paymentStatus).toBeNull();
  });

  it('responde 401 sin sesión en la lista', async () => {
    const res = await request(app.getHttpServer()).get('/orders');
    expect(res.status).toBe(401);
  });
});
