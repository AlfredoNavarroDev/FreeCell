import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Concurrencia de reservas (regla 1)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const postOrder = (user: User, body: object) =>
    request(app.getHttpServer())
      .post('/orders')
      .set(
        'Authorization',
        `Bearer ${app.get(JwtService).sign({ sub: user.id, role: user.role })}`,
      )
      .send(body);

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

  it('20 compras simultáneas contra 5 licencias: 5 aceptadas, 15 sin stock, ninguna licencia repetida', async () => {
    const { plan } = await createCatalog(ds, { stock: 5 });
    const users = await Promise.all(
      Array.from({ length: 20 }, () => createUser(ds)),
    );

    const responses = await Promise.all(
      users.map((user) =>
        postOrder(user, {
          currency: 'PEN',
          items: [{ planId: plan.id, qty: 1 }],
        }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(15);

    const [row]: { reserved: string; distinctItems: string }[] = await ds.query(
      `SELECT count(*) AS reserved, count(DISTINCT "orderItemId") AS "distinctItems"
         FROM license_items WHERE status = 'RESERVED'`,
    );
    expect(Number(row.reserved)).toBe(5);
    expect(Number(row.distinctItems)).toBe(5);
  });

  it('carritos cruzados (A,B) y (B,A) terminan sin deadlock', async () => {
    const a = await createCatalog(ds, { stock: 10 });
    const b = await createCatalog(ds, { stock: 10 });
    const users = await Promise.all(
      Array.from({ length: 10 }, () => createUser(ds)),
    );

    const responses = await Promise.all(
      users.map((user, i) => {
        const items =
          i % 2 === 0
            ? [
                { planId: a.plan.id, qty: 1 },
                { planId: b.plan.id, qty: 1 },
              ]
            : [
                { planId: b.plan.id, qty: 1 },
                { planId: a.plan.id, qty: 1 },
              ];
        return postOrder(user, { currency: 'PEN', items });
      }),
    );

    expect(responses.every((r) => r.status === 201)).toBe(true);
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM license_items WHERE status = 'RESERVED'`,
    );
    expect(Number(count)).toBe(20);
  });
});
