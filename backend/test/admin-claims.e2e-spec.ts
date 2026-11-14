import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser, insertOrder } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('/admin/claims', () => {
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

  async function markDelivered(orderId: string, licenseIds: string[]) {
    await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [
      orderId,
    ]);
    await ds.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [
      orderId,
    ]);
    await ds.query(
      `UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = ANY($1::uuid[])`,
      [licenseIds],
    );
  }

  async function insertClaim(
    orderId: string,
    licenseItemId: string,
    userId: string,
  ): Promise<string> {
    const [{ id }]: { id: string }[] = await ds.query(
      `INSERT INTO claims ("orderId", "licenseItemId", "userId", reason, status)
       VALUES ($1, $2, $3, 'La clave no funciona', 'OPEN') RETURNING id`,
      [orderId, licenseItemId, userId],
    );
    return id;
  }

  it('lista la cola con producto, plan y stock disponible, sin la clave', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        {
          planId: catalog.plan.id,
          unitPriceCents: 1000,
          licenseId: catalog.licenseIds[0],
        },
      ],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    await insertClaim(orderId, catalog.licenseIds[0], user.id);

    const res = await request(app.getHttpServer())
      .get('/admin/claims?status=OPEN')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const item = res.body.items[0];
    expect(item.productName).toBe(catalog.product.name);
    expect(item.planName).toBe(catalog.plan.name);
    expect(item.availableStock).toBe(1);
    expect(JSON.stringify(item)).not.toMatch(/SECRET|secret/);
  });

  it('responde 403 si no es admin', async () => {
    const user = await createUser(ds);
    const res = await request(app.getHttpServer())
      .get('/admin/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`);
    expect(res.status).toBe(403);
  });

  it('entrega un reemplazo: anula la original y resuelve el reclamo', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        {
          planId: catalog.plan.id,
          unitPriceCents: 1000,
          licenseId: catalog.licenseIds[0],
        },
      ],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const claimId = await insertClaim(orderId, catalog.licenseIds[0], user.id);

    const res = await request(app.getHttpServer())
      .post(`/admin/claims/${claimId}/replace`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESOLVED');

    const logs: { action: string }[] = await ds.query(
      `SELECT action FROM audit_logs WHERE entity = 'claim' AND "entityId" = $1 AND action = 'claim.resolved'`,
      [claimId],
    );
    expect(logs).toHaveLength(1);
  });

  it('responde 409 si no hay stock para reponer; el reclamo sigue abierto', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        {
          planId: catalog.plan.id,
          unitPriceCents: 1000,
          licenseId: catalog.licenseIds[0],
        },
      ],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const claimId = await insertClaim(orderId, catalog.licenseIds[0], user.id);

    const res = await request(app.getHttpServer())
      .post(`/admin/claims/${claimId}/replace`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(409);
    const [claim]: { status: string }[] = await ds.query(
      `SELECT status FROM claims WHERE id = $1`,
      [claimId],
    );
    expect(claim.status).toBe('OPEN');
  });

  it('rechaza un reclamo con motivo', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        {
          planId: catalog.plan.id,
          unitPriceCents: 1000,
          licenseId: catalog.licenseIds[0],
        },
      ],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const claimId = await insertClaim(orderId, catalog.licenseIds[0], user.id);

    const res = await request(app.getHttpServer())
      .post(`/admin/claims/${claimId}/reject`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ reason: 'La clave funciona correctamente' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
    const [claim]: { rejectionReason: string }[] = await ds.query(
      `SELECT "rejectionReason" FROM claims WHERE id = $1`,
      [claimId],
    );
    expect(claim.rejectionReason).toBe('La clave funciona correctamente');
  });

  it('responde 404 si el reclamo no existe', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const res = await request(app.getHttpServer())
      .post(`/admin/claims/00000000-0000-0000-0000-000000000000/replace`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.status).toBe(404);
  });
});
