import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { ReviewStatus, Role } from '../src/database/enums';
import {
  createCatalog,
  createUser,
  insertDeliveredOrder,
  insertReview,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Moderación de reseñas /admin/reviews', () => {
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

  async function seedReview(status: ReviewStatus = ReviewStatus.PENDING) {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const customer = await createUser(ds, { name: 'Lucía Torres' });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertDeliveredOrder(ds, {
      userId: customer.id,
      planId: catalog.plan.id,
      licenseId: catalog.licenseIds[0],
    });
    const reviewId = await insertReview(ds, {
      userId: customer.id,
      orderId,
      productId: catalog.product.id,
      rating: 4,
      status,
    });
    return { admin, customer, catalog, orderId, reviewId };
  }

  const auth = (user: User) => ({ Authorization: `Bearer ${tokenFor(user)}` });

  it('lista la cola con producto, pedido y cliente', async () => {
    const { admin, catalog, customer } = await seedReview();

    const res = await request(app.getHttpServer())
      .get('/admin/reviews?status=PENDING')
      .set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      status: 'PENDING',
      rating: 4,
      productName: catalog.product.name,
      customerName: 'Lucía Torres',
      customerEmail: customer.email,
    });
    expect(res.body.items[0].orderNumber).toEqual(expect.any(Number));
  });

  it('filtra por estado', async () => {
    const { admin } = await seedReview(ReviewStatus.HIDDEN);
    const pending = await request(app.getHttpServer())
      .get('/admin/reviews?status=PENDING')
      .set(auth(admin));
    const hidden = await request(app.getHttpServer())
      .get('/admin/reviews?status=HIDDEN')
      .set(auth(admin));
    expect(pending.body.total).toBe(0);
    expect(hidden.body.total).toBe(1);
  });

  it('responde 403 si no es admin y 401 sin sesión', async () => {
    const { customer } = await seedReview();
    const forbidden = await request(app.getHttpServer())
      .get('/admin/reviews')
      .set(auth(customer));
    expect(forbidden.status).toBe(403);
    const anonymous = await request(app.getHttpServer()).get('/admin/reviews');
    expect(anonymous.status).toBe(401);
  });

  it('aprueba: pasa a APPROVED, se publica y se audita', async () => {
    const { admin, catalog, reviewId } = await seedReview();

    const res = await request(app.getHttpServer())
      .post(`/admin/reviews/${reviewId}/approve`)
      .set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviewId, status: 'APPROVED' });

    const publicRes = await request(app.getHttpServer()).get(
      `/catalog/products/${catalog.product.slug}/reviews`,
    );
    expect(publicRes.body.items).toHaveLength(1);
    expect(publicRes.body.ratingAvg).toBe(4);

    const audits: { action: string; actorId: string; meta: unknown }[] =
      await ds.query(
        `SELECT action, "actorId", meta FROM audit_logs WHERE entity = 'review' AND "entityId" = $1`,
        [reviewId],
      );
    expect(audits).toEqual([
      {
        action: 'review.approved',
        actorId: admin.id,
        meta: { previousStatus: 'PENDING' },
      },
    ]);
  });

  it('oculta una aprobada y la quita del público; luego se puede reaprobar', async () => {
    const { admin, catalog, reviewId } = await seedReview(
      ReviewStatus.APPROVED,
    );

    const hide = await request(app.getHttpServer())
      .post(`/admin/reviews/${reviewId}/hide`)
      .set(auth(admin));
    expect(hide.status).toBe(200);
    expect(hide.body.status).toBe('HIDDEN');

    const publicHidden = await request(app.getHttpServer()).get(
      `/catalog/products/${catalog.product.slug}/reviews`,
    );
    expect(publicHidden.body.items).toHaveLength(0);
    expect(publicHidden.body.ratingAvg).toBeNull();

    const reapprove = await request(app.getHttpServer())
      .post(`/admin/reviews/${reviewId}/approve`)
      .set(auth(admin));
    expect(reapprove.status).toBe(200);
    expect(reapprove.body.status).toBe('APPROVED');
  });

  it('oculta una PENDING directamente', async () => {
    const { admin, reviewId } = await seedReview();
    const res = await request(app.getHttpServer())
      .post(`/admin/reviews/${reviewId}/hide`)
      .set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('HIDDEN');
  });

  it('responde 409 al pedir el estado en el que ya está', async () => {
    const { admin, reviewId } = await seedReview(ReviewStatus.APPROVED);
    const approveAgain = await request(app.getHttpServer())
      .post(`/admin/reviews/${reviewId}/approve`)
      .set(auth(admin));
    expect(approveAgain.status).toBe(409);

    await request(app.getHttpServer())
      .post(`/admin/reviews/${reviewId}/hide`)
      .set(auth(admin));
    const hideAgain = await request(app.getHttpServer())
      .post(`/admin/reviews/${reviewId}/hide`)
      .set(auth(admin));
    expect(hideAgain.status).toBe(409);
  });

  it('responde 404 si la reseña no existe y 400 si el id no es UUID', async () => {
    const { admin } = await seedReview();
    const missing = await request(app.getHttpServer())
      .post('/admin/reviews/00000000-0000-4000-8000-000000000000/approve')
      .set(auth(admin));
    expect(missing.status).toBe(404);
    const invalid = await request(app.getHttpServer())
      .post('/admin/reviews/no-es-uuid/approve')
      .set(auth(admin));
    expect(invalid.status).toBe(400);
  });

  it('dos aprobaciones simultáneas: una gana (200) y la otra recibe 409', async () => {
    const { admin, reviewId } = await seedReview();
    const send = () =>
      request(app.getHttpServer())
        .post(`/admin/reviews/${reviewId}/approve`)
        .set(auth(admin));

    const results = await Promise.all([send(), send()]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const audits: unknown[] = await ds.query(
      `SELECT 1 FROM audit_logs WHERE action = 'review.approved' AND "entityId" = $1`,
      [reviewId],
    );
    expect(audits).toHaveLength(1);
  });
});
