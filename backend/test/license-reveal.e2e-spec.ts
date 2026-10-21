import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { OrderStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser, insertOrder } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('POST /orders/:id/license/reveal', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  let crypto: CryptoService;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    crypto = app.get(CryptoService);
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * `insertOrder` reserva (RESERVED) y deja el pedido en PENDING_PAYMENT; para "entregado" hace
   * falta pasar primero por IN_REVIEW (el trigger `fn_order_status_guard` no permite el salto
   * directo PENDING_PAYMENT->DELIVERED) y marcar la licencia SOLD (RESERVED->SOLD sí es válido).
   */
  async function markDelivered(orderId: string, licenseIds: string[]) {
    await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [
      orderId,
    ]);
    await ds.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [
      orderId,
    ]);
    await ds.query(
      `UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = ANY($1::uuid[])`,
      [licenseIds],
    );
  }

  /**
   * `createCatalog` inserta un `secretEncrypted` opaco ('test:test:test', ver `factories.ts`)
   * porque el resto de las pruebas nunca descifra. Reveal sí necesita un valor real: lo
   * re-cifra aquí con la misma `CryptoService` de la app bajo prueba.
   */
  async function setRealSecret(licenseId: string, secret: string) {
    await ds.query(
      `UPDATE license_items SET "secretEncrypted" = $1 WHERE id = $2`,
      [crypto.encrypt(secret), licenseId],
    );
  }

  it('revela la(s) clave(s) de un pedido entregado y audita', async () => {
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
    await markDelivered(orderId, catalog.licenseIds);
    await setRealSecret(catalog.licenseIds[0], 'SECRET-UNO');

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    const body = res.body as { planId: string; secret: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].planId).toBe(catalog.plan.id);
    expect(typeof body[0].secret).toBe('string');
    expect(body[0].secret.length).toBeGreaterThan(0);

    const logs: { action: string; meta: Record<string, unknown> }[] =
      await ds.query(
        `SELECT action, meta FROM audit_logs WHERE entity = 'order' AND "entityId" = $1 AND action = 'license.revealed'`,
        [orderId],
      );
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].meta)).not.toContain(body[0].secret);
  });

  it('revela varias claves si el pedido tiene varios ítems (D30)', async () => {
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
    await setRealSecret(catalog.licenseIds[0], 'SECRET-UNO');
    await setRealSecret(catalog.licenseIds[1], 'SECRET-DOS');

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    const body = res.body as { secret: string }[];
    expect(body).toHaveLength(2);
    expect(body[0].secret).not.toBe(body[1].secret);
  });

  it('responde 409 si el pedido no está entregado', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(409);
  });

  it('responde 404 si el pedido es de otro cliente', async () => {
    const owner = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: owner.id,
      currency: 'PEN',
      lines: [
        { planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] },
      ],
    });
    await markDelivered(orderId, catalog.licenseIds);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`);

    expect(res.status).toBe(404);
  });

  it('responde 401 sin sesión', async () => {
    const res = await request(app.getHttpServer()).post(
      `/orders/00000000-0000-0000-0000-000000000000/license/reveal`,
    );
    expect(res.status).toBe(401);
  });
});
