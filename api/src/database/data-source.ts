import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

// Usado por: npm run migration:generate / migration:run
export default new DataSource(buildDataSourceOptions(process.env));
