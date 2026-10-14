import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';

/** Deja licencias_test vacía y con todas las migraciones aplicadas (tablas, triggers, vistas, funciones). */
export default async function globalSetup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://freecell:freecell@localhost:5432/licencias_test';
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
  );
  await client.end();

  execSync('npm run migration:run', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url, DB_SSL: 'false' },
    stdio: 'inherit',
  });
}
