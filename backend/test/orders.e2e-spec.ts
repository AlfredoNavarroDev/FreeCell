import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Pedidos', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });
  const postOrder = (user: User, body: object) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(body);
  const getOrder = (user: User, id: string) =>
    request(app.getHttpServer())
      .get(`/orders/${id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);
  const cancelOrder = (user: User, id: string) =>
    request(app.getHttpServer())
      .post(`/orders/${id}/cancel`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);
  const countLicenses = async (status: string) => {
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM license_items WHERE status = $1`,
      [status],
    );
    return Number(count);
  };
  const countAudit = async (action: string) => {
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM audit_logs WHERE action = $1`,
      [action],
    );
    return Number(count);
  };

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

  it('reserva todas las unidades del carrito en un pedido', async () => {
    const user = await createUser(ds);
    const a = await createCatalog(ds, { stock: 3, prices: { PEN: 1000 } });
    const b = await createCatalog(ds, { stock: 2, prices: { PEN: 2500 } });

    const res = await postOrder(user, {
      currency: 'PEN',
      items: [
        { planId: a.plan.id, qty: 2 },
        { planId: b.plan.id, qty: 1 },
      ],
    }).expect(201);

    expect(res.body).toMatchObject({
      status: 'PENDING_PAYMENT',
      currency: 'PEN',
      totalCents: 4500,
      orderNumber: 1001,
    });
    expect(res.body.items).toHaveLength(3);
    expect(await countLicenses('RESERVED')).toBe(3);
    const [{ ok }]: { ok: boolean }[] = await ds.query(
      `SELECT bool_and(li."reservedUntil" = o."expiresAt") AS ok
         FROM license_items li JOIN order_items oi ON oi.id = li."orderItemId" JOIN orders o ON o.id = oi."orderId"`,
    );
    expect(ok).toBe(true);
  });

  it('si un ítem no tiene stock rechaza todo el carrito y no reserva nada', async () => {
    const user = await createUser(ds);
    const a = await createCatalog(ds, { stock: 3 });
    const b = await createCatalog(ds, { stock: 0, planName: 'Plan agotado' });

    const res = await postOrder(user, {
      currency: 'PEN',
      items: [
        { planId: a.plan.id, qty: 1 },
        { planId: b.plan.id, qty: 1 },
      ],
    }).expect(409);

    expect(res.body.message).toBe('Sin stock suficiente de Plan agotado');
    expect(await countLicenses('RESERVED')).toBe(0);
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM orders`,
    );
    expect(Number(count)).toBe(0);
  });

  it('congela el precio aunque cambie después', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, { prices: { PEN: 1000 } });
    const created = await postOrder(user, {
      currency: 'PEN',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(201);

    await ds.query(
      `UPDATE plan_prices SET "priceCents" = 9999 WHERE "planId" = $1`,
      [plan.id],
    );

    const res = await getOrder(user, created.body.id as string).expect(200);
    expect(res.body.items[0].unitPriceCents).toBe(1000);
    expect(res.body.totalCents).toBe(1000);
  });

  it('cobra el precio de la moneda elegida', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, {
      stock: 2,
      prices: { PEN: 1000, USD: 300 },
    });

    const pen = await postOrder(user, {
      currency: 'PEN',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(201);
    const usd = await postOrder(user, {
      currency: 'USD',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(201);

    expect(pen.body).toMatchObject({ currency: 'PEN', totalCents: 1000 });
    expect(usd.body).toMatchObject({ currency: 'USD', totalCents: 300 });
  });

  it('responde 409 si un plan no tiene precio en la moneda elegida', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, {
      prices: { PEN: 1000 },
      planName: 'Plan solo soles',
    });
    const res = await postOrder(user, {
      currency: 'USD',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(409);
    expect(res.body.message).toBe('Plan solo soles no está disponible en USD');
  });

  it('responde 400 con una moneda no permitida', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await postOrder(user, {
      currency: 'EUR',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(400);
  });

  it('responde 400 con un plan repetido en el carrito', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await postOrder(user, {
      currency: 'PEN',
      items: [
        { planId: plan.id, qty: 1 },
        { planId: plan.id, qty: 1 },
      ],
    }).expect(400);
  });

  it('exige toolUsername si el producto se activa sobre la cuenta del cliente', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, {
      requiresToolUsername: true,
      planName: 'Plan con cuenta',
    });
    const res = await postOrder(user, {
      currency: 'PEN',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(400);
    expect(res.body.message).toBe(
      'Plan con cuenta requiere tu usuario de la herramienta',
    );
    await postOrder(user, {
      currency: 'PEN',
      toolUsername: 'tecnico-01',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(201);
  });

  it('responde 404 si el plan está inactivo', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await ds.query(`UPDATE plans SET active = false WHERE id = $1`, [plan.id]);
    await postOrder(user, {
      currency: 'PEN',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(404);
  });

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).post('/orders').send({}).expect(401);
  });

  it('un cliente no ve pedidos ajenos (IDOR)', async () => {
    const alice = await createUser(ds);
    const bob = await createUser(ds);
    const { plan } = await createCatalog(ds);
    const created = await postOrder(alice, {
      currency: 'PEN',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(201);

    await getOrder(alice, created.body.id as string).expect(200);
    const res = await getOrder(bob, created.body.id as string).expect(404);
    expect(res.body.message).toBe('Pedido no encontrado');
  });

  it('audita la creación del pedido', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await postOrder(user, {
      currency: 'PEN',
      items: [{ planId: plan.id, qty: 1 }],
    }).expect(201);
    const [row]: { meta: { totalCents: number; currency: string } }[] =
      await ds.query(
        `SELECT meta FROM audit_logs WHERE action = 'order.created'`,
      );
    expect(row.meta).toMatchObject({ totalCents: 1000, currency: 'PEN' });
  });

  describe('cancelar', () => {
    it('libera las licencias reservadas', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds, { stock: 2 });
      const created = await postOrder(user, {
        currency: 'PEN',
        items: [{ planId: plan.id, qty: 2 }],
      }).expect(201);

      const res = await cancelOrder(user, created.body.id as string).expect(
        200,
      );

      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'CUSTOMER_CANCELLED',
      });
      expect(await countLicenses('AVAILABLE')).toBe(2);
      expect(await countAudit('order.cancelled')).toBe(1);
    });

    it('es idempotente', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const created = await postOrder(user, {
        currency: 'PEN',
        items: [{ planId: plan.id, qty: 1 }],
      }).expect(201);

      await cancelOrder(user, created.body.id as string).expect(200);
      await cancelOrder(user, created.body.id as string).expect(200);
      expect(await countAudit('order.cancelled')).toBe(1);
    });

    it('responde 409 si el pedido está en revisión', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const created = await postOrder(user, {
        currency: 'PEN',
        items: [{ planId: plan.id, qty: 1 }],
      }).expect(201);
      await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [
        created.body.id,
      ]);

      const res = await cancelOrder(user, created.body.id as string).expect(
        409,
      );
      expect(res.body.message).toBe(
        'Solo puedes cancelar un pedido pendiente de pago',
      );
      expect(await countLicenses('RESERVED')).toBe(1);
    });

    it('un cliente no puede cancelar el pedido de otro', async () => {
      const alice = await createUser(ds);
      const bob = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const created = await postOrder(alice, {
        currency: 'PEN',
        items: [{ planId: plan.id, qty: 1 }],
      }).expect(201);
      await cancelOrder(bob, created.body.id as string).expect(404);
    });
  });
});
