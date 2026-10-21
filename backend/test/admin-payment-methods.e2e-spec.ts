import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PaymentMethodKind, Role } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createPaymentMethod, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('payment-methods', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });

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

  describe('GET /payment-methods (público)', () => {
    it('lista solo métodos activos', async () => {
      await createPaymentMethod(ds, { code: 'activo-1', active: true });
      await createPaymentMethod(ds, { code: 'inactivo-1', active: false });

      const res = await request(app.getHttpServer()).get('/payment-methods');

      expect(res.status).toBe(200);
      const body = res.body as { code: string }[];
      expect(body.map((m) => m.code)).toEqual(['activo-1']);
    });

    it('filtra por moneda', async () => {
      await createPaymentMethod(ds, {
        code: 'solo-usd',
        currencies: ['USD'],
      });
      await createPaymentMethod(ds, {
        code: 'solo-pen',
        currencies: ['PEN'],
      });

      const res = await request(app.getHttpServer()).get(
        '/payment-methods?currency=USD',
      );

      const body = res.body as { code: string }[];
      expect(body.map((m) => m.code)).toEqual(['solo-usd']);
    });

    it('no requiere sesión', async () => {
      const res = await request(app.getHttpServer()).get('/payment-methods');
      expect(res.status).toBe(200);
    });
  });

  describe('/admin/payment-methods', () => {
    it('rechaza a un cliente (403)', async () => {
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const res = await request(app.getHttpServer())
        .get('/admin/payment-methods')
        .set('Authorization', `Bearer ${tokenFor(customer)}`);
      expect(res.status).toBe(403);
    });

    it('lista todos los métodos, incluidos inactivos', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      await createPaymentMethod(ds, { code: 'visible', active: true });
      await createPaymentMethod(ds, { code: 'oculto', active: false });

      const res = await request(app.getHttpServer())
        .get('/admin/payment-methods')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as { code: string }[];
      expect(body.map((m) => m.code).sort()).toEqual(['oculto', 'visible']);
    });

    it('crea un método y lo audita', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });

      const res = await request(app.getHttpServer())
        .post('/admin/payment-methods')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          code: 'yape-principal',
          name: 'Yape',
          kind: PaymentMethodKind.WALLET,
          currencies: ['PEN'],
          instructions: { phone: '[999999999]' },
        });

      expect(res.status).toBe(201);
      const body = res.body as { id: string; code: string };
      expect(body.code).toBe('yape-principal');

      const logs: { action: string; entity: string; entityId: string }[] =
        await ds.query(
          `SELECT action, entity, "entityId" FROM audit_logs WHERE entity = 'payment_method' AND "entityId" = $1`,
          [body.id],
        );
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('payment_method.created');
    });

    it('rechaza CRYPTO con moneda distinta de USD', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .post('/admin/payment-methods')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          code: 'usdt-malo',
          name: 'USDT',
          kind: PaymentMethodKind.CRYPTO,
          currencies: ['PEN'],
          instructions: {},
        });
      expect(res.status).toBe(400);
    });

    it('edita un método (incluye desactivarlo) y lo audita', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const method = await createPaymentMethod(ds, { code: 'editable' });

      const res = await request(app.getHttpServer())
        .patch(`/admin/payment-methods/${method.id}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ active: false, name: 'Editable (desactivado)' });

      expect(res.status).toBe(200);
      const body = res.body as { active: boolean; name: string };
      expect(body.active).toBe(false);
      expect(body.name).toBe('Editable (desactivado)');

      const logs: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity = 'payment_method' AND "entityId" = $1`,
        [method.id],
      );
      expect(logs.map((l) => l.action)).toContain('payment_method.updated');
    });

    it('responde 404 al editar un método inexistente', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .patch(`/admin/payment-methods/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ active: false });
      expect(res.status).toBe(404);
    });
  });
});
