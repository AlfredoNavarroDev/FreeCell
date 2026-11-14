import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { Role } from '../src/database/enums';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('/admin/support-tickets', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const auth = (user: User) => ({
    Authorization: `Bearer ${app.get(JwtService).sign({ sub: user.id, role: user.role })}`,
  });

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

  async function openTicket(user: User, subject = 'Ayuda con mi pedido') {
    const res = await request(app.getHttpServer())
      .post('/support-tickets')
      .set(auth(user))
      .send({ subject, body: 'Necesito ayuda' });
    return res.body.id as string;
  }

  it('un cliente no accede a la cola (403)', async () => {
    const user = await createUser(ds);
    const res = await request(app.getHttpServer())
      .get('/admin/support-tickets')
      .set(auth(user));
    expect(res.status).toBe(403);
  });

  it('lista la cola con filtro por estado, más antiguo primero', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const first = await openTicket(user, 'Primero');
    const second = await openTicket(user, 'Segundo');
    await ds.query(
      `UPDATE support_tickets SET status = 'CLOSED' WHERE id = $1`,
      [second],
    );

    const open = await request(app.getHttpServer())
      .get('/admin/support-tickets?status=OPEN')
      .set(auth(admin));
    expect(open.status).toBe(200);
    expect(open.body.total).toBe(1);
    expect(open.body.items[0]).toMatchObject({
      ticketId: first,
      subject: 'Primero',
      status: 'OPEN',
      customerEmail: user.email,
      messageCount: 1,
    });

    const all = await request(app.getHttpServer())
      .get('/admin/support-tickets')
      .set(auth(admin));
    const items = (all.body as { items: { subject: string }[] }).items;
    expect(items.map((t) => t.subject)).toEqual(['Primero', 'Segundo']);
  });

  it('detalle devuelve hilo y datos del cliente; id inexistente es 404', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);
    const ok = await request(app.getHttpServer())
      .get(`/admin/support-tickets/${id}`)
      .set(auth(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.customerEmail).toBe(user.email);
    expect(ok.body.messages).toHaveLength(1);

    const missing = await request(app.getHttpServer())
      .get('/admin/support-tickets/00000000-0000-4000-8000-000000000000')
      .set(auth(admin));
    expect(missing.status).toBe(404);
  });

  it('el admin responde (isAdmin=true) y el cliente ve la respuesta', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);
    const res = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/messages`)
      .set(auth(admin))
      .send({ body: 'Ya lo revisamos' });
    expect(res.status).toBe(201);
    expect(res.body.messages[1]).toMatchObject({
      body: 'Ya lo revisamos',
      isAdmin: true,
    });

    const mine = await request(app.getHttpServer())
      .get(`/support-tickets/${id}`)
      .set(auth(user));
    expect(mine.body.messages).toHaveLength(2);
  });

  it('cerrar: pasa a CLOSED, audita y bloquea más mensajes y cierres', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);

    const close = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/close`)
      .set(auth(admin));
    expect(close.status).toBe(200);
    expect(close.body).toEqual({ ticketId: id, status: 'CLOSED' });
    const audits = await ds.query(
      `SELECT 1 FROM audit_logs WHERE action = 'ticket.closed' AND "entityId" = $1`,
      [id],
    );
    expect(audits).toHaveLength(1);

    const again = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/close`)
      .set(auth(admin));
    expect(again.status).toBe(409);
    const reply = await request(app.getHttpServer())
      .post(`/admin/support-tickets/${id}/messages`)
      .set(auth(admin))
      .send({ body: 'tarde' });
    expect(reply.status).toBe(409);
  });

  it('cierre y mensaje concurrentes nunca dejan un mensaje tras el cierre', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const user = await createUser(ds);
    const id = await openTicket(user);

    const [close, message] = await Promise.all([
      request(app.getHttpServer())
        .post(`/admin/support-tickets/${id}/close`)
        .set(auth(admin)),
      request(app.getHttpServer())
        .post(`/support-tickets/${id}/messages`)
        .set(auth(user))
        .send({ body: 'mensaje en carrera' }),
    ]);

    expect(close.status).toBe(200);
    expect([201, 409]).toContain(message.status);
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM ticket_messages WHERE "ticketId" = $1`,
      [id],
    );
    expect(Number(count)).toBe(message.status === 201 ? 2 : 1);
  });
});
