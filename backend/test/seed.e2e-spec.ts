import { DataSource } from 'typeorm';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { runSeed } from '../src/database/seed';
import { TEST_DATABASE_URL } from './setup-env';
import { truncateAll } from './utils/factories';

describe('Seed', () => {
  let ds: DataSource;
  const env = {
    ADMIN_EMAIL: 'Admin@FreeCell.local',
    ADMIN_PASSWORD: 'admin-password-123',
    LICENSE_ENC_KEY: process.env.LICENSE_ENC_KEY!,
  };
  const count = async (sql: string) => {
    const [{ count }]: { count: string }[] = await ds.query(sql);
    return Number(count);
  };

  beforeAll(async () => {
    ds = await new DataSource(buildDataSourceOptions({ DATABASE_URL: TEST_DATABASE_URL, DB_SSL: false })).initialize();
    await truncateAll(ds);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('es idempotente: correrlo dos veces deja los mismos datos', async () => {
    await runSeed(ds, env);
    await runSeed(ds, env);

    expect(await count(`SELECT count(*) FROM users WHERE role = 'ADMIN' AND email = 'admin@freecell.local'`)).toBe(1);
    expect(await count(`SELECT count(*) FROM plans`)).toBe(2);
    expect(await count(`SELECT count(*) FROM plan_prices`)).toBe(3);
    expect(await count(`SELECT count(*) FROM license_batches`)).toBe(1);
    expect(await count(`SELECT count(*) FROM license_items WHERE status = 'AVAILABLE'`)).toBe(5);
    expect(await count(`SELECT count(*) FROM payment_methods`)).toBe(5);
    expect(await count(`SELECT count(*) FROM settings WHERE key = 'reservationTtlMinutes'`)).toBe(1);
  });

  it('guarda las licencias cifradas y descifrables con LICENSE_ENC_KEY', async () => {
    const crypto = new CryptoService(env.LICENSE_ENC_KEY);
    const rows: { secretEncrypted: string }[] = await ds.query(
      `SELECT "secretEncrypted" FROM license_items ORDER BY "createdAt"`,
    );
    expect(rows[0].secretEncrypted).not.toContain('DEMO-');
    expect(rows.map((r) => crypto.decrypt(r.secretEncrypted)).sort()).toEqual([
      'DEMO-0001',
      'DEMO-0002',
      'DEMO-0003',
      'DEMO-0004',
      'DEMO-0005',
    ]);
  });

  it('el único método CRYPTO acepta solo USD', async () => {
    const rows: { code: string; currencies: string }[] = await ds.query(
      `SELECT code, currencies::text FROM payment_methods WHERE kind = 'CRYPTO'`,
    );
    expect(rows).toEqual([{ code: 'binance-pay', currencies: '{USD}' }]);
  });
});
