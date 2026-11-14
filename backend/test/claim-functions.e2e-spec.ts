import { type NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Role } from '../src/database/enums';
import { createCatalog, createUser, insertOrder } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('fn_resolve_claim / fn_reject_claim', () => {
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

  async function markDelivered(orderId: string, licenseIds: string[]) {
    await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [orderId]);
    await ds.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [orderId]);
    await ds.query(
      `UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = ANY($1::uuid[])`,
      [licenseIds],
    );
  }

  async function insertClaim(orderId: string, licenseItemId: string, userId: string): Promise<string> {
    const [{ id }]: { id: string }[] = await ds.query(
      `INSERT INTO claims ("orderId", "licenseItemId", "userId", reason, status)
       VALUES ($1, $2, $3, 'La clave no funciona', 'OPEN') RETURNING id`,
      [orderId, licenseItemId, userId],
    );
    return id;
  }

  it('con stock: anula la original y entrega una nueva con el mismo orderItemId', async () => {
    const user = await createUser(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const catalog = await createCatalog(ds, { stock: 2 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const claimId = await insertClaim(orderId, catalog.licenseIds[0], user.id);

    const [{ result }]: { result: string }[] = await ds.query(
      `SELECT fn_resolve_claim($1, $2) AS result`,
      [claimId, admin.id],
    );
    expect(result).toBe('RESOLVED');

    const [original]: { status: string; orderItemId: string | null }[] = await ds.query(
      `SELECT status, "orderItemId" FROM license_items WHERE id = $1`,
      [catalog.licenseIds[0]],
    );
    expect(original.status).toBe('VOID');
    expect(original.orderItemId).not.toBeNull();

    const [replacement]: { status: string; orderItemId: string; replacesId: string }[] = await ds.query(
      `SELECT status, "orderItemId", "replacesId" FROM license_items WHERE id = $1`,
      [catalog.licenseIds[1]],
    );
    expect(replacement.status).toBe('SOLD');
    expect(replacement.orderItemId).toBe(original.orderItemId);
    expect(replacement.replacesId).toBe(catalog.licenseIds[0]);

    const [claim]: { status: string; replacementLicenseId: string }[] = await ds.query(
      `SELECT status, "replacementLicenseId" FROM claims WHERE id = $1`,
      [claimId],
    );
    expect(claim.status).toBe('RESOLVED');
    expect(claim.replacementLicenseId).toBe(catalog.licenseIds[1]);
  });

  it('sin stock: devuelve NO_STOCK y no toca nada', async () => {
    const user = await createUser(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const claimId = await insertClaim(orderId, catalog.licenseIds[0], user.id);

    const [{ result }]: { result: string }[] = await ds.query(
      `SELECT fn_resolve_claim($1, $2) AS result`,
      [claimId, admin.id],
    );
    expect(result).toBe('NO_STOCK');

    const [original]: { status: string }[] = await ds.query(
      `SELECT status FROM license_items WHERE id = $1`,
      [catalog.licenseIds[0]],
    );
    expect(original.status).toBe('SOLD');

    const [claim]: { status: string }[] = await ds.query(`SELECT status FROM claims WHERE id = $1`, [claimId]);
    expect(claim.status).toBe('OPEN');
  });

  it('fn_reject_claim marca REJECTED con el motivo', async () => {
    const user = await createUser(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const claimId = await insertClaim(orderId, catalog.licenseIds[0], user.id);

    const [{ rejected }]: { rejected: boolean }[] = await ds.query(
      `SELECT fn_reject_claim($1, $2, $3) AS rejected`,
      [claimId, admin.id, 'La clave funciona correctamente'],
    );
    expect(rejected).toBe(true);

    const [claim]: { status: string; rejectionReason: string }[] = await ds.query(
      `SELECT status, "rejectionReason" FROM claims WHERE id = $1`,
      [claimId],
    );
    expect(claim.status).toBe('REJECTED');
    expect(claim.rejectionReason).toBe('La clave funciona correctamente');
  });

  it('fn_reject_claim sobre un reclamo ya resuelto lanza error', async () => {
    const user = await createUser(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] }],
    });
    await markDelivered(orderId, [catalog.licenseIds[0]]);
    const claimId = await insertClaim(orderId, catalog.licenseIds[0], user.id);
    await ds.query(`SELECT fn_reject_claim($1, $2, $3)`, [claimId, admin.id, 'motivo 1']);

    await expect(
      ds.query(`SELECT fn_reject_claim($1, $2, $3)`, [claimId, admin.id, 'motivo 2']),
    ).rejects.toThrow();
  });
});
