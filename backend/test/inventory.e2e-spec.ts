import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { Role, OrderStatus } from '../src/database/enums';
import { LicenseItem, type User } from '../src/database/entities';
import { LicenseStatus } from '../src/database/enums';
import { createCatalog, createUser, insertOrder } from './utils/factories';
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

  describe('POST /admin/inventory/batches/preview', () => {
    it('cuenta válidas/duplicadas/con error sin persistir nada', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      const crypto = app.get(CryptoService);
      await ds.getRepository(LicenseItem).save({
        planId: catalog.plan.id,
        batchId: catalog.batch.id,
        secretEncrypted: crypto.encrypt('YA-EXISTE'),
        secretHash: crypto.hash('YA-EXISTE'),
        status: LicenseStatus.AVAILABLE,
      });

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches/preview')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          secrets: ['YA-EXISTE', 'YA-EXISTE', 'NUEVA-1', ''],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ validCount: 1, duplicateCount: 2, errorCount: 1 });

      const countAfter: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_items WHERE "planId" = $1`,
        [catalog.plan.id],
      );
      expect(Number(countAfter[0].count)).toBe(1);
    });

    it('responde 404 si el plan no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches/preview')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ planId: randomUUID(), secrets: ['X'] });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/inventory/batches', () => {
    it('carga un lote en PEN: inserta solo las válidas, fxRatePen nulo, y audita', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'PEN',
          unitCostCents: 500,
          supplier: 'Proveedor Test',
          secrets: ['PEN-1', 'PEN-1', ''],
        });

      expect(res.status).toBe(200);
      const body = res.body as {
        batchId: string;
        loadedCount: number;
        duplicateCount: number;
        errorCount: number;
      };
      expect(body).toEqual({
        batchId: body.batchId,
        loadedCount: 1,
        duplicateCount: 1,
        errorCount: 1,
      });

      const batchRow: { fxRatePen: string | null; costCurrency: string }[] =
        await ds.query(
          `SELECT "fxRatePen", "costCurrency" FROM license_batches WHERE id = $1`,
          [body.batchId],
        );
      expect(batchRow[0]).toEqual({ fxRatePen: null, costCurrency: 'PEN' });

      const licenseCount: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_items WHERE "batchId" = $1`,
        [body.batchId],
      );
      expect(Number(licenseCount[0].count)).toBe(1);

      const auditRows: { entityId: string; actorId: string }[] =
        await ds.query(
          `SELECT "entityId", "actorId" FROM audit_logs WHERE action = 'license_batch.created' AND "entityId" = $1`,
          [body.batchId],
        );
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actorId).toBe(admin.id);
    });

    it('en USD sin tasa configurada responde 400 y no crea el lote', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      const before: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'USD',
          unitCostCents: 200,
          secrets: ['USD-1'],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/tasa USD→PEN/);
      const after: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );
      expect(after[0].count).toBe(before[0].count);
    });

    it('en USD con tasa configurada congela el valor vigente en el lote', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      await ds.query(
        `INSERT INTO settings (key, value) VALUES ('usdPenRate', '3.75'::jsonb)`,
      );

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'USD',
          unitCostCents: 200,
          secrets: ['USD-OK'],
        });

      expect(res.status).toBe(200);
      const batchRow: { fxRatePen: string }[] = await ds.query(
        `SELECT "fxRatePen" FROM license_batches WHERE id = $1`,
        [res.body.batchId],
      );
      expect(batchRow[0].fxRatePen).toBe('3.7500');
    });

    it('0 válidas responde 400 y no crea el lote (rollback)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      const before: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'PEN',
          unitCostCents: 500,
          secrets: ['', '   '],
        });

      expect(res.status).toBe(400);
      const after: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );
      expect(after[0].count).toBe(before[0].count);
    });
  });

  describe('POST /admin/inventory/licenses/:id/void', () => {
    it('anula una licencia AVAILABLE y audita el motivo', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 1 });
      const licenseId = catalog.licenseIds[0];

      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${licenseId}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'Clave reportada como inválida por el proveedor' });

      expect(res.status).toBe(204);
      const row: { status: string }[] = await ds.query(
        `SELECT status FROM license_items WHERE id = $1`,
        [licenseId],
      );
      expect(row[0].status).toBe('VOID');

      const auditRows: { meta: { reason: string } }[] = await ds.query(
        `SELECT meta FROM audit_logs WHERE action = 'license_item.voided' AND "entityId" = $1`,
        [licenseId],
      );
      expect(auditRows[0].meta.reason).toBe(
        'Clave reportada como inválida por el proveedor',
      );
    });

    it('responde 409 si la licencia ya no está AVAILABLE', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const catalog = await createCatalog(ds, { stock: 1 });
      await insertOrder(ds, {
        userId: customer.id,
        currency: 'PEN',
        lines: [
          {
            planId: catalog.plan.id,
            unitPriceCents: 1000,
            licenseId: catalog.licenseIds[0],
          },
        ],
        status: OrderStatus.IN_REVIEW,
      });

      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${catalog.licenseIds[0]}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'Intento sobre una licencia reservada' });

      expect(res.status).toBe(409);
    });

    it('responde 404 si la licencia no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${randomUUID()}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'No existe' });
      expect(res.status).toBe(404);
    });

    it('responde 400 si el motivo está vacío o es solo espacios', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 1 });
      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${catalog.licenseIds[0]}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: '   ' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/inventory/usd-rate', () => {
    it('actualiza la tasa y queda reflejada en GET /admin/inventory, auditada', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });

      const res = await request(app.getHttpServer())
        .put('/admin/inventory/usd-rate')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ rate: 3.8 });
      expect(res.status).toBe(204);

      const listRes = await request(app.getHttpServer())
        .get('/admin/inventory')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      expect(listRes.body.usdPenRate).toBe(3.8);

      const auditRows: { meta: { value: number } }[] = await ds.query(
        `SELECT meta FROM audit_logs WHERE action = 'setting.updated' AND "entityId" = 'usdPenRate'`,
      );
      expect(auditRows[0].meta.value).toBe(3.8);
    });

    it('responde 400 con una tasa menor o igual a cero', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .put('/admin/inventory/usd-rate')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ rate: 0 });
      expect(res.status).toBe(400);
    });
  });
});
