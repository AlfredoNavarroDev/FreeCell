import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PlanKind, Role } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('CRUD admin de catálogo', () => {
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

  describe('/admin/categories', () => {
    it('rechaza a un cliente (403)', async () => {
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const res = await request(app.getHttpServer())
        .get('/admin/categories')
        .set('Authorization', `Bearer ${tokenFor(customer)}`);
      expect(res.status).toBe(403);
    });

    it('crea, edita y borra una categoría, todo auditado', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });

      const created = await request(app.getHttpServer())
        .post('/admin/categories')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Antivirus' });
      expect(created.status).toBe(201);
      const categoryId = (created.body as { id: string }).id;

      const edited = await request(app.getHttpServer())
        .patch(`/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Antivirus Pro' });
      expect(edited.status).toBe(200);
      expect((edited.body as { name: string }).name).toBe('Antivirus Pro');

      const removed = await request(app.getHttpServer())
        .delete(`/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      expect(removed.status).toBe(204);

      const logs: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity = 'category' AND "entityId" = $1 ORDER BY "createdAt"`,
        [categoryId],
      );
      expect(logs.map((l) => l.action)).toEqual([
        'category.created',
        'category.updated',
        'category.deleted',
      ]);
    });

    it('responde 404 al editar una categoría inexistente', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .patch(`/admin/categories/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('/admin/products', () => {
    it('crea un producto con requiresToolUsername y lo desactiva editándolo', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });

      const created = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          name: '[Producto de prueba]',
          slug: 'producto-de-prueba',
          requiresToolUsername: true,
        });
      expect(created.status).toBe(201);
      const body = created.body as { id: string; requiresToolUsername: boolean };
      expect(body.requiresToolUsername).toBe(true);

      const deactivated = await request(app.getHttpServer())
        .patch(`/admin/products/${body.id}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ active: false });
      expect(deactivated.status).toBe(200);
      expect((deactivated.body as { active: boolean }).active).toBe(false);
    });

    it('rechaza un slug duplicado (409, vía índice único)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Uno', slug: 'slug-repetido' });

      const res = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Dos', slug: 'slug-repetido' });

      expect(res.status).toBe(409);
    });
  });

  describe('/admin/plans', () => {
    it('crea un plan con precios en dos monedas y luego actualiza solo una (D61)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const product = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: '[Producto]', slug: 'producto-para-plan' });
      const productId = (product.body as { id: string }).id;

      const created = await request(app.getHttpServer())
        .post('/admin/plans')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          productId,
          name: '30 días',
          durationDays: 30,
          kind: PlanKind.NEW,
          prices: [
            { currency: 'PEN', priceCents: 1000 },
            { currency: 'USD', priceCents: 300 },
          ],
        });
      expect(created.status).toBe(201);
      const planId = (created.body as { id: string }).id;

      const updated = await request(app.getHttpServer())
        .patch(`/admin/plans/${planId}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ prices: [{ currency: 'PEN', priceCents: 1200 }] });

      expect(updated.status).toBe(200);
      const body = updated.body as {
        prices: { currency: string; priceCents: number }[];
      };
      expect(body.prices).toEqual(
        expect.arrayContaining([
          { currency: 'PEN', priceCents: 1200 },
          { currency: 'USD', priceCents: 300 },
        ]),
      );

      const logs: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity = 'plan' AND "entityId" = $1`,
        [planId],
      );
      expect(logs.map((l) => l.action)).toContain('plan.updated');
    });

    it('rechaza un plan sin precios (400)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const product = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: '[Producto 2]', slug: 'producto-sin-precios' });
      const productId = (product.body as { id: string }).id;

      const res = await request(app.getHttpServer())
        .post('/admin/plans')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ productId, name: 'x', durationDays: 30, prices: [] });

      expect(res.status).toBe(400);
    });
  });
});
