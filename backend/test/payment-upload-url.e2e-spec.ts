import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OrderStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser, insertOrder } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('POST /orders/:id/payment/upload-url', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });
  const requestUploadUrl = (user: User, orderId: string, body: object) =>
    request(app.getHttpServer())
      .post(`/orders/${orderId}/payment/upload-url`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
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

  it('firma una URL de subida para un pedido propio pendiente de pago', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 1000 },
    });
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

    const res = await requestUploadUrl(user, orderId, {
      contentType: 'image/png',
      fileSizeBytes: 1024,
    });

    expect(res.status).toBe(200);
    const body = res.body as { uploadUrl: string; proofKey: string };
    expect(body.uploadUrl).toContain('X-Amz-Signature');
    expect(body.proofKey).toMatch(new RegExp(`^proofs/${orderId}/.+\\.png$`));
  });

  it('responde 404 si el pedido es de otro cliente', async () => {
    const owner = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: owner.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await requestUploadUrl(stranger, orderId, {
      contentType: 'image/png',
      fileSizeBytes: 1024,
    });

    expect(res.status).toBe(404);
  });

  it('responde 409 si el pedido ya no está pendiente de pago', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });

    const res = await requestUploadUrl(user, orderId, {
      contentType: 'image/png',
      fileSizeBytes: 1024,
    });

    expect(res.status).toBe(409);
  });

  it('responde 400 si el tipo de archivo no está permitido', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await requestUploadUrl(user, orderId, {
      contentType: 'application/zip',
      fileSizeBytes: 1024,
    });

    expect(res.status).toBe(400);
  });

  it('responde 400 si el archivo supera el tamaño máximo', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await requestUploadUrl(user, orderId, {
      contentType: 'image/png',
      fileSizeBytes: 6 * 1024 * 1024,
    });

    expect(res.status).toBe(400);
  });

  it('responde 401 sin sesión', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/00000000-0000-0000-0000-000000000000/payment/upload-url`)
      .send({ contentType: 'image/png', fileSizeBytes: 1024 });

    expect(res.status).toBe(401);
  });
});
