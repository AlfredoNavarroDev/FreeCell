import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

/** Corre las migraciones pendientes con el código compilado (release_command de Fly, servicio migrate de Compose). */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta DATABASE_URL');
  }
  const ds = await new DataSource(
    buildDataSourceOptions({
      DATABASE_URL: url,
      DB_SSL: process.env.DB_SSL === 'true',
    }),
  ).initialize();
  try {
    const applied = await ds.runMigrations({ transaction: 'each' });
    console.log(`Migraciones aplicadas: ${applied.length}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
