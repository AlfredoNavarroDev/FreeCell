import { type NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { ReviewStatus } from '../src/database/enums';
import {
  createCatalog,
  createUser,
  insertDeliveredOrder,
  insertOrder,
  insertReview,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Reseñas en Postgres: trg_review_requires_delivered y v_product_ratings', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

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

  it('permite reseñar un producto de un pedido entregado propio', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertDeliveredOrder(ds, {
      userId: user.id,
      planId: catalog.plan.id,
      licenseId: catalog.licenseIds[0],
    });

    const id = await insertReview(ds, {
      userId: user.id,
      orderId,
      productId: catalog.product.id,
      rating: 5,
    });

    expect(id).toEqual(expect.any(String));
  });

  it('rechaza una reseña sobre un pedido de otro usuario', async () => {
    const buyer = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertDeliveredOrder(ds, {
      userId: buyer.id,
      planId: catalog.plan.id,
      licenseId: catalog.licenseIds[0],
    });

    await expect(
      insertReview(ds, {
        userId: stranger.id,
        orderId,
        productId: catalog.product.id,
        rating: 5,
      }),
    ).rejects.toThrow(/pedido tuyo entregado/);
  });

  it('rechaza una reseña sobre un pedido que no está entregado', async () => {
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

    await expect(
      insertReview(ds, {
        userId: user.id,
        orderId,
        productId: catalog.product.id,
        rating: 5,
      }),
    ).rejects.toThrow(/pedido tuyo entregado/);
  });

  it('rechaza una reseña de un producto que no está en el pedido', async () => {
    const user = await createUser(ds);
    const bought = await createCatalog(ds, { stock: 1 });
    const other = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertDeliveredOrder(ds, {
      userId: user.id,
      planId: bought.plan.id,
      licenseId: bought.licenseIds[0],
    });

    await expect(
      insertReview(ds, {
        userId: user.id,
        orderId,
        productId: other.product.id,
        rating: 5,
      }),
    ).rejects.toThrow(/pedido tuyo entregado/);
  });

  it('v_product_ratings promedia solo las reseñas APPROVED', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 4 });
    const statuses: [number, ReviewStatus][] = [
      [5, ReviewStatus.APPROVED],
      [4, ReviewStatus.APPROVED],
      [1, ReviewStatus.HIDDEN],
      [3, ReviewStatus.PENDING],
    ];
    for (const [i, [rating, status]] of statuses.entries()) {
      const { orderId } = await insertDeliveredOrder(ds, {
        userId: user.id,
        planId: catalog.plan.id,
        licenseId: catalog.licenseIds[i],
      });
      await insertReview(ds, {
        userId: user.id,
        orderId,
        productId: catalog.product.id,
        rating,
        status,
      });
    }

    const rows: { ratingAvg: string; ratingCount: number }[] = await ds.query(
      `SELECT "ratingAvg", "ratingCount" FROM v_product_ratings WHERE "productId" = $1`,
      [catalog.product.id],
    );

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].ratingAvg)).toBe(4.5);
    expect(rows[0].ratingCount).toBe(2);
  });

  it('v_product_ratings no lista productos sin reseñas aprobadas', async () => {
    const catalog = await createCatalog(ds, { stock: 1 });
    const rows: unknown[] = await ds.query(
      `SELECT 1 FROM v_product_ratings WHERE "productId" = $1`,
      [catalog.product.id],
    );
    expect(rows).toHaveLength(0);
  });
});
