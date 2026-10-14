// Las pruebas usan una base y un Redis aparte: nunca tocan los datos de desarrollo.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://freecell:freecell@localhost:5432/licencias_test';

process.env.NODE_ENV = 'test';
process.env.APP_ROLE = 'api';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DB_SSL = 'false';
process.env.REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_PEPPER = 'test-refresh-pepper-0123456789abcdef0123';
process.env.LICENSE_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.CORS_ORIGIN = 'http://localhost:3001';
process.env.THROTTLE_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
