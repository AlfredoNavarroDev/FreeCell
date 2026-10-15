import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Category } from '../src/database/entities';
import { createTestApp, resetState } from './utils/test-app';

describe('Catálogo', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /catalog/categories', () => {
    it('lista las categorías existentes sin requerir sesión', async () => {
      await ds.getRepository(Category).save([{ name: 'Desbloqueo' }, { name: 'Flasheo' }]);

      const res = await request(app.getHttpServer()).get('/catalog/categories');

      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name).sort()).toEqual([
        'Desbloqueo',
        'Flasheo',
      ]);
    });

    it('responde una lista vacía si no hay categorías', async () => {
      const res = await request(app.getHttpServer()).get('/catalog/categories');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
