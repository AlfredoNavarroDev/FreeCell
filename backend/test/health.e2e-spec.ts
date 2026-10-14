import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('Health y transversales HTTP', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
  });

  it('GET /health/ready verifica Postgres y Redis', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    const body = res.body as {
      status: string;
      info: { database: { status: string }; redis: { status: string } };
    };
    expect(body.status).toBe('ok');
    expect(body.info.database.status).toBe('up');
    expect(body.info.redis.status).toBe('up');
  });

  it('propaga o genera X-Request-Id', async () => {
    const echoed = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');
    const generated = await request(app.getHttpServer()).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aplica cabeceras de seguridad (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('una ruta inexistente usa el formato de error estándar', async () => {
    const res = await request(app.getHttpServer())
      .get('/no-existe')
      .expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('rechaza cuerpos JSON de más de 100 kb', async () => {
    await request(app.getHttpServer())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(110 * 1024) }))
      .expect(413);
  });
});
