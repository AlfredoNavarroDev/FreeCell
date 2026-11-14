import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { createCatalog, createUser, insertOrder } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('POST /claims y GET /claims', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) => app.get(JwtService).sign({ sub: user.id, role: user.role });

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
    await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [orderId]);
    await ds.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [orderId]);
    await ds.query(
      `UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = ANY($1::uuid[])`,
      [licenseIds],
    );
  }

  async function orderItemIdFor(licenseId: string): Promise<string> {
    const [{ orderItemId }]: { orderItemId: string }[] = await ds.query(
      `SELECT "orderItemId" FROM license_items WHERE id = $1`,
      [licenseId],
    );
    return orderItemId;
  }

  // trg_set_updated_at (DatabaseLogic) fija "updatedAt" = now() en cada UPDATE a "orders" sin
  // condición, así que un UPDATE directo no puede retrasar la fecha: hay que desactivar el
  // trigger para esta prueba, en una declaración aparte (no se puede en la misma transacción
  // que insertó la fila: "pending trigger events"), y reactivarlo enseguida.
  async function backdateOrder(orderId: string, days: number) {
    await ds.query(`ALTER TABLE orders DISABLE TRIGGER trg_set_updated_at`);
    await ds.query(
      `UPDATE orders SET "updatedAt" = now() - make_interval(days => $2) WHERE id = $1`,
      [orderId, days],
    );
    await ds.query(`ALTER TABLE orders ENABLE TRIGGER trg_set_updated_at`);
  }

  it('crea un reclamo sobre un pedido entregado', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const orderItemId = await orderItemIdFor(catalog.licenseIds[0]);

    const res = await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ orderId, orderItemId, reason: 'La clave no activa la herramienta' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.orderId).toBe(orderId);
  });

  it('elige una licencia específica cuando el pedido tiene varios ítems', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        { planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] },
        { planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[1] },
      ],
    });
    await markDelivered(orderId, catalog.licenseIds);
    const orderItemId = await orderItemIdFor(catalog.licenseIds[1]);

    const res = await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ orderId, orderItemId, reason: 'Esta clave en particular no funciona' });

    expect(res.status).toBe(201);
    const [claim]: { licenseItemId: string }[] = await ds.query(
      `SELECT "licenseItemId" FROM claims WHERE "orderId" = $1`,
      [orderId],
    );
    expect(claim.licenseItemId).toBe(catalog.licenseIds[1]);
  });

  it('responde 403 si el pedido no está entregado', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ orderId, orderItemId: '00000000-0000-0000-0000-000000000000', reason: 'No llegó la clave' });

    expect(res.status).toBe(403);
  });

  it('responde 404 si el pedido es de otro cliente', async () => {
    const owner = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: owner.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const orderItemId = await orderItemIdFor(catalog.licenseIds[0]);

    const res = await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)
      .send({ orderId, orderItemId, reason: 'No es mía pero probemos' });

    expect(res.status).toBe(404);
  });

  it('responde 409 fuera de la ventana de 7 días (D25)', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    await backdateOrder(orderId, 8);
    const orderItemId = await orderItemIdFor(catalog.licenseIds[0]);

    const res = await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ orderId, orderItemId, reason: 'Llegué tarde a reclamar' });

    expect(res.status).toBe(409);
  });

  it('responde 409 si ya hay un reclamo abierto para el pedido (RF-REC-03)', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const orderItemId = await orderItemIdFor(catalog.licenseIds[0]);
    await ds.query(
      `INSERT INTO claims ("orderId", "licenseItemId", "userId", reason, status) VALUES ($1, $2, $3, 'motivo previo', 'OPEN')`,
      [orderId, catalog.licenseIds[0], user.id],
    );

    const res = await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ orderId, orderItemId, reason: 'Otro reclamo más' });

    expect(res.status).toBe(409);
  });

  it('responde 409 si el pedido ya usó su reposición (D26)', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const orderItemId = await orderItemIdFor(catalog.licenseIds[0]);
    await ds.query(
      `INSERT INTO claims ("orderId", "licenseItemId", "userId", reason, status, "resolvedAt")
       VALUES ($1, $2, $3, 'motivo previo', 'RESOLVED', now())`,
      [orderId, catalog.licenseIds[0], user.id],
    );

    const res = await request(app.getHttpServer())
      .post('/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ orderId, orderItemId, reason: 'Otra vez la misma clave falla' });

    expect(res.status).toBe(409);
  });

  it('solo uno de dos reclamos simultáneos sobre el mismo pedido se crea', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const orderItemId = await orderItemIdFor(catalog.licenseIds[0]);

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/claims')
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .send({ orderId, orderItemId, reason: 'Intento 1' }),
      request(app.getHttpServer())
        .post('/claims')
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .send({ orderId, orderItemId, reason: 'Intento 2' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('GET /claims lista solo las propias, con el motivo de rechazo si aplica', async () => {
    const user = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    const { orderId: mine } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    const { orderId: other } = await insertOrder(ds, {
      userId: stranger.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[1] }],
    });
    await markDelivered(mine, [catalog.licenseIds[0]]);
    await markDelivered(other, [catalog.licenseIds[1]]);
    await ds.query(
      `INSERT INTO claims ("orderId", "licenseItemId", "userId", reason, status, "rejectionReason", "resolvedAt")
       VALUES ($1, $2, $3, 'motivo', 'REJECTED', 'La clave funciona bien', now())`,
      [mine, catalog.licenseIds[0], user.id],
    );
    await ds.query(
      `INSERT INTO claims ("orderId", "licenseItemId", "userId", reason, status) VALUES ($1, $2, $3, 'motivo ajeno', 'OPEN')`,
      [other, catalog.licenseIds[1], stranger.id],
    );

    const res = await request(app.getHttpServer())
      .get('/claims')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe('REJECTED');
    expect(res.body.items[0].rejectionReason).toBe('La clave funciona bien');
  });

  it('responde 401 sin sesión', async () => {
    const res = await request(app.getHttpServer()).post('/claims').send({});
    expect(res.status).toBe(401);
  });
});
