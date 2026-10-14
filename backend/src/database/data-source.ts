import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

// Usado por el CLI: npm run migration:generate | migration:run | migration:revert
export default new DataSource(
  buildDataSourceOptions({
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    DB_SSL: process.env.DB_SSL === 'true',
  }),
);
