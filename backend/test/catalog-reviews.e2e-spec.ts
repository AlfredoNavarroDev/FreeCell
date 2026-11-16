import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ReviewStatus } from '../src/database/enums';
import {
  createCatalog,
  createUser,
  insertDeliveredOrder,
  insertReview,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Reseñas públicas y promedio en el catálogo', () => {
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

  async function reviewFor(
    catalog: Awaited<ReturnType<typeof createCatalog>>,
    licenseIndex: number,
    name: string | null,
    rating: number,
    status: ReviewStatus,
    body = `Reseña de ${rating} estrellas con texto suficiente`,
  ) {
    const user = await createUser(ds, { name });
    const { orderId } = await insertDeliveredOrder(ds, {
      userId: user.id,
      planId: catalog.plan.id,
      licenseId: catalog.licenseIds[licenseIndex],
    });
    await insertReview(ds, {
      userId: user.id,
      orderId,
      productId: catalog.product.id,
      rating,
      status,
      body,
    });
  }

  async function seedThreeReviews() {
    const catalog = await createCatalog(ds, { stock: 3 });
    await reviewFor(
      catalog,
      0,
      'Carlos Manuel Pérez',
      5,
      ReviewStatus.APPROVED,
    );
    await reviewFor(catalog, 1, null, 4, ReviewStatus.APPROVED);
    await reviewFor(catalog, 2, 'Pendiente Usuario', 1, ReviewStatus.PENDING);
    return catalog;
  }

  describe('GET /catalog/products/:slug/reviews', () => {
    it('devuelve solo las APPROVED, sin sesión, con autor público y promedio', async () => {
      const catalog = await seedThreeReviews();

      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}/reviews`,
      );

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.ratingCount).toBe(2);
      expect(res.body.ratingAvg).toBe(4.5);
      const authors = (res.body.items as { authorName: string }[]).map(
        (i) => i.authorName,
      );
      expect(authors.sort()).toEqual(['Carlos P.', 'Cliente verificado']);
      expect(JSON.stringify(res.body)).not.toMatch(/@test\.pe|userId|email/);
    });

    it('lista la más reciente primero y pagina', async () => {
      const catalog = await seedThreeReviews();

      const page1 = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}/reviews?pageSize=1&page=1`,
      );
      const page2 = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}/reviews?pageSize=1&page=2`,
      );

      expect(page1.body.items).toHaveLength(1);
      expect(page2.body.items).toHaveLength(1);
      expect(page1.body.items[0].authorName).toBe('Cliente verificado');
      expect(page2.body.items[0].authorName).toBe('Carlos P.');
      expect(page1.body.total).toBe(2);
    });

    it('una reseña HIDDEN no aparece ni cuenta en el promedio', async () => {
      const catalog = await createCatalog(ds, { stock: 2 });
      await reviewFor(catalog, 0, 'Ana Ruiz', 5, ReviewStatus.APPROVED);
      await reviewFor(catalog, 1, 'Eva Paz', 1, ReviewStatus.HIDDEN);

      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}/reviews`,
      );

      expect(res.body.items).toHaveLength(1);
      expect(res.body.ratingAvg).toBe(5);
      expect(res.body.ratingCount).toBe(1);
    });

    it('producto sin reseñas: lista vacía, ratingAvg null y ratingCount 0', async () => {
      const catalog = await createCatalog(ds, { stock: 1 });
      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}/reviews`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        items: [],
        total: 0,
        ratingAvg: null,
        ratingCount: 0,
      });
    });

    it('responde 404 si el producto no existe o está inactivo', async () => {
      const missing = await request(app.getHttpServer()).get(
        '/catalog/products/no-existe/reviews',
      );
      expect(missing.status).toBe(404);

      const catalog = await createCatalog(ds, { stock: 1 });
      await ds.query(`UPDATE products SET active = false WHERE id = $1`, [
        catalog.product.id,
      ]);
      const inactive = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}/reviews`,
      );
      expect(inactive.status).toBe(404);
    });
  });

  describe('ratingAvg y ratingCount en el catálogo', () => {
    it('la lista y la ficha traen el promedio; sin reseñas, null y 0', async () => {
      const rated = await seedThreeReviews();
      const unrated = await createCatalog(ds, { stock: 1 });

      const list = await request(app.getHttpServer()).get('/catalog/products');
      const byId = new Map(
        (
          list.body.items as {
            id: string;
            ratingAvg: number | null;
            ratingCount: number;
          }[]
        ).map((i) => [i.id, i]),
      );
      expect(byId.get(rated.product.id)).toMatchObject({
        ratingAvg: 4.5,
        ratingCount: 2,
      });
      expect(byId.get(unrated.product.id)).toMatchObject({
        ratingAvg: null,
        ratingCount: 0,
      });

      const detail = await request(app.getHttpServer()).get(
        `/catalog/products/${rated.product.slug}`,
      );
      expect(detail.body).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
    });
  });
});
