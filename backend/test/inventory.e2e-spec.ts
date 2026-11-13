import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('/admin/inventory', () => {
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

  describe('GET /admin/inventory', () => {
    it('rechaza a un cliente (403)', async () => {
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const res = await request(app.getHttpServer())
        .get('/admin/inventory')
        .set('Authorization', `Bearer ${tokenFor(customer)}`);
      expect(res.status).toBe(403);
    });

    it('responde 401 sin sesión', async () => {
      const res = await request(app.getHttpServer()).get('/admin/inventory');
      expect(res.status).toBe(401);
    });

    it('devuelve una fila por plan con conteos, umbral, estado y la tasa USD→PEN (null si no se configuró)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 2, lowStockThreshold: 5 });

      const res = await request(app.getHttpServer())
        .get('/admin/inventory')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        items: {
          planId: string;
          productName: string;
          planName: string;
          lowStockThreshold: number;
          available: number;
          reserved: number;
          sold: number;
          status: string;
        }[];
        usdPenRate: number | null;
      };
      const row = body.items.find((i) => i.planId === catalog.plan.id)!;
      expect(row).toEqual({
        planId: catalog.plan.id,
        productName: catalog.product.name,
        planName: catalog.plan.name,
        lowStockThreshold: 5,
        available: 2,
        reserved: 0,
        sold: 0,
        status: 'LOW',
      });
      expect(body.usdPenRate).toBeNull();
    });
  });

  describe('GET /admin/inventory/plans/:planId/licenses', () => {
    it('devuelve solo las licencias AVAILABLE, con id y fecha de carga, nunca la clave', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 3 });

      const res = await request(app.getHttpServer())
        .get(`/admin/inventory/plans/${catalog.plan.id}/licenses`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as { id: string; createdAt: string }[];
      expect(body).toHaveLength(3);
      expect(body.map((l) => l.id).sort()).toEqual(
        [...catalog.licenseIds].sort(),
      );
      for (const license of body) {
        expect(Object.keys(license).sort()).toEqual(['createdAt', 'id']);
      }
    });

    it('responde 404 si el plan no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .get(`/admin/inventory/plans/${randomUUID()}/licenses`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      expect(res.status).toBe(404);
    });
  });
});
