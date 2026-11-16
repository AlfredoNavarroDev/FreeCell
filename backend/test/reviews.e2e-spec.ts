import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import {
  createCatalog,
  createUser,
  insertDeliveredOrder,
  insertOrder,
  insertReview,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('POST /reviews y GET /reviews', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });

  const BODY = 'La herramienta activó sin problemas y rápido';

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

  const post = (user: User, payload: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/reviews')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(payload);

  async function setupDelivered() {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    const { orderId } = await insertDeliveredOrder(ds, {
      userId: user.id,
      planId: catalog.plan.id,
      licenseId: catalog.licenseIds[0],
    });
    return { user, catalog, orderId };
  }

  it('crea una reseña PENDING y la audita', async () => {
    const { user, catalog, orderId } = await setupDelivered();

    const res = await post(user, {
      orderId,
      productId: catalog.product.id,
      rating: 5,
      body: BODY,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      orderId,
      productId: catalog.product.id,
      productName: catalog.product.name,
      rating: 5,
      body: BODY,
      status: 'PENDING',
    });
    const audits: { action: string }[] = await ds.query(
      `SELECT action FROM audit_logs WHERE entity = 'review'`,
    );
    expect(audits).toEqual([{ action: 'review.created' }]);
  });

  it('recorta espacios del cuerpo antes de validar el largo', async () => {
    const { user, catalog, orderId } = await setupDelivered();
    const res = await post(user, {
      orderId,
      productId: catalog.product.id,
      rating: 4,
      body: `   ${BODY}   `,
    });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe(BODY);
  });

  it('responde 401 sin sesión', async () => {
    const res = await request(app.getHttpServer()).post('/reviews').send({});
    expect(res.status).toBe(401);
  });

  it('responde 404 si el pedido es de otro cliente', async () => {
    const { catalog, orderId } = await setupDelivered();
    const stranger = await createUser(ds);
    const res = await post(stranger, {
      orderId,
      productId: catalog.product.id,
      rating: 5,
      body: BODY,
    });
    expect(res.status).toBe(404);
  });

  it('responde 403 si el pedido no está entregado', async () => {
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
    const res = await post(user, {
      orderId,
      productId: catalog.product.id,
      rating: 5,
      body: BODY,
    });
    expect(res.status).toBe(403);
  });

  it('responde 403 si el producto no es parte del pedido', async () => {
    const { user, orderId } = await setupDelivered();
    const other = await createCatalog(ds, { stock: 1 });
    const res = await post(user, {
      orderId,
      productId: other.product.id,
      rating: 5,
      body: BODY,
    });
    expect(res.status).toBe(403);
  });

  it('responde 409 si ya valoró ese producto en ese pedido', async () => {
    const { user, catalog, orderId } = await setupDelivered();
    const payload = {
      orderId,
      productId: catalog.product.id,
      rating: 5,
      body: BODY,
    };
    expect((await post(user, payload)).status).toBe(201);
    const second = await post(user, payload);
    expect(second.status).toBe(409);
  });

  it('dos reseñas simultáneas del mismo producto: una gana y la otra recibe 409', async () => {
    const { user, catalog, orderId } = await setupDelivered();
    const payload = {
      orderId,
      productId: catalog.product.id,
      rating: 5,
      body: BODY,
    };

    const results = await Promise.all([
      post(user, payload),
      post(user, payload),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM reviews WHERE "orderId" = $1`,
      [orderId],
    );
    expect(Number(count)).toBe(1);
  });

  it.each([
    ['rating 0', { rating: 0, body: BODY }],
    ['rating 6', { rating: 6, body: BODY }],
    ['rating decimal', { rating: 4.5, body: BODY }],
    ['cuerpo corto', { rating: 5, body: 'muy corto' }],
    ['cuerpo solo espacios', { rating: 5, body: '            ' }],
  ])('responde 400 con %s', async (_label, extra) => {
    const { user, catalog, orderId } = await setupDelivered();
    const res = await post(user, {
      orderId,
      productId: catalog.product.id,
      ...extra,
    });
    expect(res.status).toBe(400);
  });

  it('GET /reviews devuelve solo las reseñas del cliente, la más reciente primero', async () => {
    const { user, catalog, orderId } = await setupDelivered();
    const mine = await insertReview(ds, {
      userId: user.id,
      orderId,
      productId: catalog.product.id,
      rating: 3,
    });
    const stranger = await createUser(ds);
    const otherCatalog = await createCatalog(ds, { stock: 1 });
    const { orderId: otherOrder } = await insertDeliveredOrder(ds, {
      userId: stranger.id,
      planId: otherCatalog.plan.id,
      licenseId: otherCatalog.licenseIds[0],
    });
    await insertReview(ds, {
      userId: stranger.id,
      orderId: otherOrder,
      productId: otherCatalog.product.id,
      rating: 1,
    });

    const res = await request(app.getHttpServer())
      .get('/reviews')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: mine,
      productName: catalog.product.name,
      rating: 3,
      status: 'PENDING',
    });
  });
});
