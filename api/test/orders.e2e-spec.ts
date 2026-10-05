import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CryptoService } from '../src/common/crypto.service';
import { Category, LicenseBatch, LicenseItem, Order, Plan, Product } from '../src/database/entities';
import { LicenseStatus, OrderStatus } from '../src/database/enums';
import { OrdersService } from '../src/orders/orders.service';
import { QUEUE_RESERVATIONS } from '../src/queues/queues.constants';

// Los tests usan una base y un Redis aparte para no tocar tus datos de desarrollo.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://licencias:licencias@localhost:5432/licencias_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.DB_SYNC = 'true';

async function createApp(ttlMs: number): Promise<INestApplication> {
  process.env.RESERVATION_TTL_MS = String(ttlMs);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

async function reset(app: INestApplication) {
  const ds = app.get(DataSource);
  await ds.query(
    `TRUNCATE claims, payments, order_items, orders, license_items, license_batches, plans, products,
     categories, notification_logs, audit_logs, users RESTART IDENTITY CASCADE`,
  );
  await app.get<Queue>(getQueueToken(QUEUE_RESERVATIONS)).obliterate({ force: true });
}

async function seedPlan(app: INestApplication, stock: number) {
  const ds = app.get(DataSource);
  const crypto = app.get(CryptoService);
  const category = await ds.getRepository(Category).save({ name: 'Cat' });
  const product = await ds.getRepository(Product).save({ name: 'Herramienta', slug: 'h-1', description: null, categoryId: category.id });
  const plan = await ds.getRepository(Plan).save({ productId: product.id, name: '30 días', durationDays: 30, priceCents: 2000 });
  const batch = await ds.getRepository(LicenseBatch).save({ planId: plan.id, supplier: null, unitCostCents: 1000, notes: null });
  for (let i = 0; i < stock; i++) {
    const secret = `KEY-${i}-${Math.random().toString(36).slice(2)}`;
    await ds.getRepository(LicenseItem).save({
      planId: plan.id,
      batchId: batch.id,
      secretEncrypted: crypto.encrypt(secret),
      secretHash: crypto.hash(secret),
    });
  }
  return plan;
}

async function register(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'password-123' });
  return res.body.accessToken as string;
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

describe('Auth', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp(30 * 60 * 1000);
    await reset(app);
  });
  afterAll(() => app.close());

  it('registra, inicia sesión y devuelve el perfil con el token', async () => {
    const http = request(app.getHttpServer());
    const reg = await http.post('/auth/register').send({ email: 'Ana@Ejemplo.com', password: 'password-123', name: 'Ana' }).expect(201);
    expect(reg.body.user).toMatchObject({ email: 'ana@ejemplo.com', role: 'CUSTOMER' });

    const login = await http.post('/auth/login').send({ email: 'ana@ejemplo.com', password: 'password-123' }).expect(201);
    const me = await http.get('/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body.email).toBe('ana@ejemplo.com');
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('rechaza correo repetido, clave incorrecta y rutas sin token', async () => {
    const http = request(app.getHttpServer());
    await http.post('/auth/register').send({ email: 'ana@ejemplo.com', password: 'password-123' }).expect(409);
    await http.post('/auth/login').send({ email: 'ana@ejemplo.com', password: 'incorrecta-123' }).expect(401);
    await http.get('/auth/me').expect(401);
  });

  it('no deja a un cliente asignarse el rol ADMIN', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'x@ejemplo.com', password: 'password-123', role: 'ADMIN' })
      .expect(400);
  });
});

describe('Reserva de licencias', () => {
  let app: INestApplication;
  let ds: DataSource;
  beforeAll(async () => {
    app = await createApp(30 * 60 * 1000);
    ds = app.get(DataSource);
  });
  beforeEach(() => reset(app));
  afterAll(() => app.close());

  it('10 compras simultáneas con 3 licencias: exactamente 3 reservan y nunca se repite una', async () => {
    const plan = await seedPlan(app, 3);
    const token = await register(app, 'cliente@ejemplo.com');

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer()).post('/orders').set('Authorization', `Bearer ${token}`).send({ planId: plan.id }),
      ),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);

    const licenses = await ds.getRepository(LicenseItem).find();
    expect(licenses.every((l) => l.status === LicenseStatus.RESERVED)).toBe(true);
    expect(new Set(licenses.map((l) => l.orderItemId)).size).toBe(3);
  });

  it('liberar es idempotente y respeta pedidos que ya pagaron', async () => {
    const plan = await seedPlan(app, 2);
    const token = await register(app, 'cliente@ejemplo.com');
    const orders = app.get(OrdersService);
    const http = () => request(app.getHttpServer()).post('/orders').set('Authorization', `Bearer ${token}`).send({ planId: plan.id });

    const a = (await http().expect(201)).body.id as string;
    const b = (await http().expect(201)).body.id as string;

    // Pedido A sigue sin pago: se libera una sola vez.
    expect(await orders.releaseIfUnpaid(a)).toBe(true);
    expect(await orders.releaseIfUnpaid(a)).toBe(false);

    // Pedido B ya subió su comprobante: no se toca.
    await ds.getRepository(Order).update(b, { status: OrderStatus.IN_REVIEW });
    expect(await orders.releaseIfUnpaid(b)).toBe(false);

    const counts = await ds.getRepository(LicenseItem).countBy({ status: LicenseStatus.AVAILABLE });
    expect(counts).toBe(1);
    expect((await ds.getRepository(Order).findOneByOrFail({ id: a })).status).toBe(OrderStatus.CANCELLED);
    expect((await ds.getRepository(Order).findOneByOrFail({ id: b })).status).toBe(OrderStatus.IN_REVIEW);
  });

  it('el barrido libera reservas vencidas aunque no exista el trabajo programado', async () => {
    const plan = await seedPlan(app, 1);
    const token = await register(app, 'cliente@ejemplo.com');
    const res = await request(app.getHttpServer()).post('/orders').set('Authorization', `Bearer ${token}`).send({ planId: plan.id }).expect(201);

    await ds.getRepository(Order).update(res.body.id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await app.get(OrdersService).sweepExpired()).toBe(1);
    expect(await ds.getRepository(LicenseItem).countBy({ status: LicenseStatus.AVAILABLE })).toBe(1);
  });
});

describe('Liberación automática con BullMQ', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp(1500); // la reserva dura 1,5 s en este test
    await reset(app);
  });
  afterAll(() => app.close());

  it('el trabajo diferido libera la licencia cuando vence la reserva sin pago', async () => {
    const ds = app.get(DataSource);
    const plan = await seedPlan(app, 1);
    const token = await register(app, 'cliente@ejemplo.com');
    const res = await request(app.getHttpServer()).post('/orders').set('Authorization', `Bearer ${token}`).send({ planId: plan.id }).expect(201);

    expect(await ds.getRepository(LicenseItem).countBy({ status: LicenseStatus.RESERVED })).toBe(1);

    const released = await waitFor(async () => (await ds.getRepository(LicenseItem).countBy({ status: LicenseStatus.AVAILABLE })) === 1);
    expect(released).toBe(true);
    expect((await ds.getRepository(Order).findOneByOrFail({ id: res.body.id })).status).toBe(OrderStatus.CANCELLED);
  });
});
