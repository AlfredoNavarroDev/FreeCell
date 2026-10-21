import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  JWT_SECRET: 'x'.repeat(32),
  JWT_REFRESH_PEPPER: 'y'.repeat(32),
  LICENSE_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
  R2_ACCOUNT_ID: 'r2-account',
  R2_ACCESS_KEY_ID: 'r2-access-key',
  R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  R2_BUCKET: 'r2-bucket',
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
};

describe('validateEnv', () => {
  it('acepta una configuración mínima y aplica valores por defecto', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_ROLE).toBe('all');
    expect(env.PORT).toBe(3000);
    expect(env.DB_SSL).toBe(false);
    expect(env.THROTTLE_ENABLED).toBe(true);
    expect(env.CORS_ORIGIN).toBe('http://localhost:3001');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('usa APP_ROLE=api por defecto en producción', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' }).APP_ROLE).toBe(
      'api',
    );
  });

  it('convierte tipos desde strings', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      DB_SSL: 'true',
      THROTTLE_ENABLED: 'false',
    });
    expect(env.PORT).toBe(8080);
    expect(env.DB_SSL).toBe(true);
    expect(env.THROTTLE_ENABLED).toBe(false);
  });

  it('rechaza LICENSE_ENC_KEY que no mide 32 bytes', () => {
    expect(() =>
      validateEnv({
        ...base,
        LICENSE_ENC_KEY: Buffer.alloc(16, 1).toString('base64'),
      }),
    ).toThrow(/LICENSE_ENC_KEY/);
  });

  it('rechaza JWT_SECRET corto', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'corto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rechaza si falta DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });
});
