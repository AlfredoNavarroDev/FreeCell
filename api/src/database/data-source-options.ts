import { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

/** Misma configuración para la app y para el CLI de migraciones. */
export function buildDataSourceOptions(env: NodeJS.ProcessEnv): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    // Neon (y la mayoría de Postgres en la nube) exige SSL.
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    // Solo para desarrollo y tests. En producción se usan migraciones.
    synchronize: env.DB_SYNC === 'true',
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
  };
}
