import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OrderStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Correo verificado + tope de cliente nuevo al crear un pedido (RF-AUT-07, D22/D74)', () => {
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

  it('responde 403 si el correo no está verificado', async () => {
    const user = await createUser(ds, { emailVerifiedAt: null });
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 1000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(403);
  });

  it('cliente verificado y nuevo: un pedido dentro del tope pasa', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 1000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(201);
  });

  it('cliente verificado y nuevo: un pedido que supera el tope en PEN responde 409', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 100_000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(409);
  });

  it('el tope se aplica por separado en USD', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { USD: 50_000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'USD', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(409);
  });

  it('tras alcanzar newCustomerGraceOrders pedidos DELIVERED, el tope ya no aplica', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 2,
      prices: { PEN: 100_000 },
    });

    // Simula un pedido DELIVERED previo (el flujo real de aprobación es Sprint 3).
    // totalCents=0 porque no se insertan order_items: trg_order_total_check exige que
    // coincidan (regla de integridad de Postgres, D57), y aquí solo importa el estado DELIVERED.
    await ds.query(
      `INSERT INTO orders ("userId", status, "totalCents", currency, "expiresAt")
       VALUES ($1, 'DELIVERED', 0, 'PEN', now())`,
      [user.id],
    );

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(201);
  });
});
