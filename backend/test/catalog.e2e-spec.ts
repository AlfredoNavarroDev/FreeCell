import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Category, Product } from '../src/database/entities';
import { createCatalog } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Catálogo', () => {
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

  describe('GET /catalog/categories', () => {
    it('lista las categorías existentes sin requerir sesión', async () => {
      await ds.getRepository(Category).save([{ name: 'Desbloqueo' }, { name: 'Flasheo' }]);

      const res = await request(app.getHttpServer()).get('/catalog/categories');

      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name).sort()).toEqual([
        'Desbloqueo',
        'Flasheo',
      ]);
    });

    it('responde una lista vacía si no hay categorías', async () => {
      const res = await request(app.getHttpServer()).get('/catalog/categories');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /catalog/products', () => {
    it('lista solo productos activos, con priceFromCents y stockState agregado', async () => {
      const inStock = await createCatalog(ds, { stock: 10, lowStockThreshold: 5, prices: { PEN: 5000 } });
      await createCatalog(ds, { stock: 1, lowStockThreshold: 5, prices: { PEN: 3000 } }); // LOW
      const inactive = await createCatalog(ds, { stock: 10, prices: { PEN: 1000 } });
      await ds.getRepository(Product).update(inactive.product.id, { active: false });

      const res = await request(app.getHttpServer()).get('/catalog/products');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      const names = res.body.items.map((p: { name: string }) => p.name);
      expect(names).not.toContain(inactive.product.name);
      const inStockItem = res.body.items.find(
        (p: { id: string }) => p.id === inStock.product.id,
      );
      expect(inStockItem).toMatchObject({
        priceFromCents: 5000,
        currency: 'PEN',
        stockState: 'IN_STOCK',
      });
    });

    it('busca por nombre y filtra por categoría', async () => {
      const target = await createCatalog(ds, { prices: { PEN: 1000 } });
      await createCatalog(ds, { prices: { PEN: 1000 } });

      const byName = await request(app.getHttpServer()).get(
        `/catalog/products?query=${encodeURIComponent(target.product.name)}`,
      );
      expect(byName.body.total).toBe(1);
      expect(byName.body.items[0].id).toBe(target.product.id);

      const byCategory = await request(app.getHttpServer()).get(
        `/catalog/products?category=${target.product.categoryId}`,
      );
      expect(byCategory.body.total).toBe(1);
      expect(byCategory.body.items[0].id).toBe(target.product.id);
    });

    it('pagina con pageSize y respeta el máximo de 50', async () => {
      for (let i = 0; i < 3; i++) {
        await createCatalog(ds, { prices: { PEN: 1000 } });
      }

      const res = await request(app.getHttpServer()).get(
        '/catalog/products?page=2&pageSize=2',
      );
      expect(res.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(res.body.items).toHaveLength(1);

      const tooBig = await request(app.getHttpServer()).get(
        '/catalog/products?pageSize=51',
      );
      expect(tooBig.status).toBe(400);
    });

    it('no incluye un producto sin precio en la moneda pedida', async () => {
      const usdOnly = await createCatalog(ds, { prices: { USD: 10 } });

      const pen = await request(app.getHttpServer()).get('/catalog/products');
      expect(pen.body.items.map((p: { id: string }) => p.id)).not.toContain(
        usdOnly.product.id,
      );

      const usd = await request(app.getHttpServer()).get(
        '/catalog/products?currency=USD',
      );
      expect(usd.body.items.map((p: { id: string }) => p.id)).toContain(
        usdOnly.product.id,
      );
    });
  });

  describe('GET /catalog/products/:slug', () => {
    it('devuelve la ficha con sus planes y precios', async () => {
      const catalog = await createCatalog(ds, {
        stock: 10,
        lowStockThreshold: 5,
        prices: { PEN: 5000, USD: 1500 },
        requiresToolUsername: true,
      });
      await ds.getRepository(Product).update(catalog.product.id, {
        whatIncluded: 'Clave + guía',
        compatibility: 'Android 10+',
        activationGuide: 'Abre la app y pega la clave',
        faq: [{ question: '¿Cuánto dura?', answer: '30 días' }],
      });

      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: catalog.product.id,
        slug: catalog.product.slug,
        whatIncluded: 'Clave + guía',
        compatibility: 'Android 10+',
        activationGuide: 'Abre la app y pega la clave',
        faq: [{ question: '¿Cuánto dura?', answer: '30 días' }],
        requiresToolUsername: true,
      });
      expect(res.body.plans).toHaveLength(1);
      expect(res.body.plans[0]).toMatchObject({
        id: catalog.plan.id,
        stockState: 'IN_STOCK',
      });
      expect(res.body.plans[0].prices.sort((a: { currency: string }, b: { currency: string }) =>
        a.currency.localeCompare(b.currency),
      )).toEqual([
        { currency: 'PEN', priceCents: 5000 },
        { currency: 'USD', priceCents: 1500 },
      ]);
    });

    it('responde 404 si el slug no existe o el producto está inactivo', async () => {
      const notFound = await request(app.getHttpServer()).get(
        '/catalog/products/no-existe',
      );
      expect(notFound.status).toBe(404);

      const inactive = await createCatalog(ds, { prices: { PEN: 1000 } });
      await ds.getRepository(Product).update(inactive.product.id, { active: false });
      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${inactive.product.slug}`,
      );
      expect(res.status).toBe(404);
    });

    it('omite planes sin precio en ninguna moneda', async () => {
      const catalog = await createCatalog(ds, { prices: { PEN: 1000 } });
      await ds.query(`DELETE FROM plan_prices WHERE "planId" = $1`, [
        catalog.plan.id,
      ]);

      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.plans).toEqual([]);
    });
  });
});
