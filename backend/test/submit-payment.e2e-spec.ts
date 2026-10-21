import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OrderStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import {
  createCatalog,
  createPaymentMethod,
  createUser,
  insertOrder,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

const sha256Hex = () => randomBytes(32).toString('hex');

describe('POST /orders/:id/payment', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });

  const validBody = (paymentMethodId: string, overrides: object = {}) => ({
    paymentMethodId,
    proofKey: '', // se completa por caso de prueba
    proofHash: sha256Hex(),
    operationNumber: `OP-${randomBytes(4).toString('hex')}`,
    acceptsLegalDeclaration: true,
    ...overrides,
  });

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

  it('registra el pago y pasa el pedido a IN_REVIEW', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1, prices: { PEN: 1000 } });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        { planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] },
      ],
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(
        validBody(method.id, { proofKey: `proofs/${orderId}/comprobante.png` }),
      );

    expect(res.status).toBe(200);
    const body = res.body as { status: string };
    expect(body.status).toBe(OrderStatus.IN_REVIEW);

    const payments: { legalDeclarationAcceptedAt: Date }[] = await ds.query(
      `SELECT "legalDeclarationAcceptedAt" FROM payments WHERE "orderId" = $1`,
      [orderId],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].legalDeclarationAcceptedAt).not.toBeNull();

    const logs: { action: string }[] = await ds.query(
      `SELECT action FROM audit_logs WHERE entity = 'payment' ORDER BY "createdAt" DESC LIMIT 1`,
    );
    expect(logs[0].action).toBe('payment.submitted');
  });

  it('responde 404 si el pedido es de otro cliente', async () => {
    const owner = await createUser(ds);
    const stranger = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: owner.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)
      .send(validBody(method.id, { proofKey: `proofs/${orderId}/x.png` }));

    expect(res.status).toBe(404);
  });

  it('responde 409 si el pedido ya no está pendiente de pago', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(validBody(method.id, { proofKey: `proofs/${orderId}/x.png` }));

    expect(res.status).toBe(409);
  });

  it('responde 409 si la reserva venció', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
      expiresAt: new Date(Date.now() - 60_000),
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(validBody(method.id, { proofKey: `proofs/${orderId}/x.png` }));

    expect(res.status).toBe(409);
  });

  it('responde 400 si el proofKey no corresponde a este pedido', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(
        validBody(method.id, {
          proofKey: `proofs/00000000-0000-0000-0000-000000000000/x.png`,
        }),
      );

    expect(res.status).toBe(400);
  });

  it('responde 400 si no se acepta la declaración legal', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(
        validBody(method.id, {
          proofKey: `proofs/${orderId}/x.png`,
          acceptsLegalDeclaration: false,
        }),
      );

    expect(res.status).toBe(400);
  });

  it('responde 409 si el método de pago no acepta la moneda del pedido (trigger D63)', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['USD'] });
    const catalog = await createCatalog(ds, { stock: 1, prices: { PEN: 1000 } });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(validBody(method.id, { proofKey: `proofs/${orderId}/x.png` }));

    expect(res.status).toBe(409);
  });

  it('responde 409 si el número de operación ya se usó con ese método (D64)', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 2, prices: { PEN: 1000 } });
    const operationNumber = `OP-${randomBytes(4).toString('hex')}`;

    const first = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });
    await request(app.getHttpServer())
      .post(`/orders/${first.orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(
        validBody(method.id, {
          proofKey: `proofs/${first.orderId}/a.png`,
          operationNumber,
        }),
      );

    const second = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });
    const res = await request(app.getHttpServer())
      .post(`/orders/${second.orderId}/payment`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(
        validBody(method.id, {
          proofKey: `proofs/${second.orderId}/b.png`,
          operationNumber,
        }),
      );

    expect(res.status).toBe(409);
  });

  it('responde 401 sin sesión', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/00000000-0000-0000-0000-000000000000/payment`)
      .send(validBody('00000000-0000-0000-0000-000000000000', { proofKey: 'x' }));
    expect(res.status).toBe(401);
  });

  it('concurrencia: dos envíos simultáneos sobre el mismo pedido → solo uno pasa', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1, prices: { PEN: 1000 } });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const send = (operationNumber: string) =>
      request(app.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .send(
          validBody(method.id, {
            proofKey: `proofs/${orderId}/${operationNumber}.png`,
            operationNumber,
          }),
        );

    const [a, b] = await Promise.all([
      send(`OP-A-${randomBytes(4).toString('hex')}`),
      send(`OP-B-${randomBytes(4).toString('hex')}`),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const payments: { id: string }[] = await ds.query(
      `SELECT id FROM payments WHERE "orderId" = $1`,
      [orderId],
    );
    expect(payments).toHaveLength(1);
  });
});
