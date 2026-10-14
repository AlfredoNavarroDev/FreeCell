import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { TEST_DATABASE_URL } from './setup-env';

describe('Esquema inicial', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await new DataSource(
      buildDataSourceOptions({
        DATABASE_URL: TEST_DATABASE_URL,
        DB_SSL: false,
      }),
    ).initialize();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('crea las 19 tablas', async () => {
    const rows: { tablename: string }[] = await ds.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations' ORDER BY tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      'audit_logs',
      'categories',
      'claims',
      'license_batches',
      'license_items',
      'notification_logs',
      'order_items',
      'orders',
      'payment_methods',
      'payments',
      'plan_prices',
      'plans',
      'products',
      'refresh_tokens',
      'reviews',
      'settings',
      'support_tickets',
      'ticket_messages',
      'users',
    ]);
  });

  it('declara los índices parciales que sostienen las reglas de negocio', async () => {
    const rows: { indexname: string; indexdef: string }[] = await ds.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'UQ_%'`,
    );
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.get('UQ_license_items_active_order_item')).toMatch(/WHERE/);
    expect(byName.get('UQ_payments_one_pending_per_order')).toMatch(/WHERE/);
    expect(byName.get('UQ_claims_one_open_per_order')).toMatch(/WHERE/);
  });

  it('rechaza un usuario sin contraseña ni googleId', async () => {
    await expect(
      ds.query(`INSERT INTO users (email) VALUES ('sin-credenciales@test.pe')`),
    ).rejects.toThrow(/CHK_users_credentials/);
  });
});
