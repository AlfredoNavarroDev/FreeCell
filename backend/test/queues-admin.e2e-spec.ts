import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { mountQueuesAdmin } from '../src/queues-admin/queues-admin';
import { createTestApp } from './utils/test-app';

describe('/admin/queues (Bull Board)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ beforeInit: mountQueuesAdmin });
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin credenciales devuelve 401', async () => {
    await request(app.getHttpServer()).get('/admin/queues/').expect(401);
  });

  it('con credenciales incorrectas devuelve 401', async () => {
    await request(app.getHttpServer())
      .get('/admin/queues/')
      .auth('nope', 'tampoco')
      .expect(401);
  });

  it('con credenciales correctas devuelve 200', async () => {
    await request(app.getHttpServer())
      .get('/admin/queues/')
      .auth(process.env.ADMIN_QUEUES_USER!, process.env.ADMIN_QUEUES_PASSWORD!)
      .expect(200);
  });
});
