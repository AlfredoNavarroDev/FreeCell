import { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

// Al correr compilado (dist) se cargan los .js; con ts-node, los .ts. Evita cargar los .d.ts de dist.
const MIGRATIONS_EXT = __filename.endsWith('.ts') ? 'ts' : 'js';

/** Misma configuración para la app, el CLI de migraciones, el seed y las pruebas. */
export function buildDataSourceOptions(env: {
  DATABASE_URL: string;
  DB_SSL: boolean;
}): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    // Neon exige SSL.
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: [`${__dirname}/migrations/*.${MIGRATIONS_EXT}`],
    migrationsTransactionMode: 'each',
    // gen_random_uuid() viene en Postgres 13+, sin extensión uuid-ossp.
    uuidExtension: 'pgcrypto',
    synchronize: false,
  };
}
