import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('/support-tickets (cliente)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });
  const auth = (user: User) => ({ Authorization: `Bearer ${tokenFor(user)}` });

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

  async function openTicket(user: User, subject = 'No me llega la clave') {
    const res = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject, body: 'Pagué hace una hora y no veo nada' });
    return res;
  }

  it('crea un ticket OPEN con su primer mensaje y lo audita', async () => {
    const user = await createUser(ds);
    const res = await openTicket(user);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0]).toMatchObject({
      body: 'Pagué hace una hora y no veo nada',
      isAdmin: false,
    });
    const audits = await ds.query(
      `SELECT 1 FROM audit_logs WHERE action = 'ticket.created' AND "entityId" = $1`,
      [res.body.id],
    );
    expect(audits).toHaveLength(1);
  });

  it('rechaza asunto corto o mensaje vacío con 400', async () => {
    const user = await createUser(ds);
    const short = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject: 'ab', body: 'hola' });
    const empty = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject: 'Asunto válido', body: '   ' });
    expect(short.status).toBe(400);
    expect(empty.status).toBe(400);
  });

  it('exige sesión', async () => {
    const res = await request(app.getHttpServer()).get('/support-tickets');
    expect(res.status).toBe(401);
  });

  it('lista solo los tickets propios, paginados', async () => {
    const a = await createUser(ds);
    const b = await createUser(ds);
    await openTicket(a, 'Ticket de A uno');
    await openTicket(a, 'Ticket de A dos');
    await openTicket(b, 'Ticket de B');

    const res = await request(app.getHttpServer())
      .get('/support-tickets?pageSize=1')
      .set(auth(a));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].messages).toBeUndefined();
  });

  it('el detalle de un ticket ajeno es 404', async () => {
    const a = await createUser(ds);
    const b = await createUser(ds);
    const created = await openTicket(a);
    const res = await request(app.getHttpServer())
      .get(`/support-tickets/${created.body.id}`)
      .set(auth(b));
    expect(res.status).toBe(404);
  });

  it('responde en un ticket abierto y devuelve el hilo', async () => {
    const user = await createUser(ds);
    const created = await openTicket(user);
    const res = await request(app.getHttpServer())
      .post(`/support-tickets/${created.body.id}/messages`)
      .set(auth(user))
      .send({ body: 'Sigo esperando' });
    expect(res.status).toBe(201);
    const messages = res.body.messages as { body: string }[];
    expect(messages.map((m) => m.body)).toEqual([
      'Pagué hace una hora y no veo nada',
      'Sigo esperando',
    ]);
  });

  it('un ticket CLOSED rechaza mensajes del cliente con 409 (RF-SUP-04)', async () => {
    const user = await createUser(ds);
    const created = await openTicket(user);
    await ds.query(
      `UPDATE support_tickets SET status = 'CLOSED' WHERE id = $1`,
      [created.body.id],
    );
    const res = await request(app.getHttpServer())
      .post(`/support-tickets/${created.body.id}/messages`)
      .set(auth(user))
      .send({ body: 'Hola?' });
    expect(res.status).toBe(409);
  });

  it('responder en ticket ajeno es 404', async () => {
    const a = await createUser(ds);
    const b = await createUser(ds);
    const created = await openTicket(a);
    const res = await request(app.getHttpServer())
      .post(`/support-tickets/${created.body.id}/messages`)
      .set(auth(b))
      .send({ body: 'intruso' });
    expect(res.status).toBe(404);
  });
});
