import { type NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { type User } from '../src/database/entities';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Verificación de correo (RF-AUT-07)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const tokenFor = (user: User) =>
    app.get(JwtService).sign({ sub: user.id, role: user.role });

  /** El token crudo nunca sale de la API; el test lo fija a mano para poder probar verify-email. */
  async function issueKnownToken(user: User, expiresInMs = 60_000) {
    const token = 'test-token-conocido-para-e2e';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await ds.query(
      `UPDATE users SET "emailVerificationTokenHash" = $1, "emailVerificationExpiresAt" = $2 WHERE id = $3`,
      [tokenHash, new Date(Date.now() + expiresInMs), user.id],
    );
    return token;
  }

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

  it('el registro deja un token de verificación pendiente (hasheado, no en claro)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `nuevo-${Date.now()}@test.pe`,
        password: 'Password-123',
      });
    expect(res.status).toBe(201);

    const rows: {
      emailVerificationTokenHash: string | null;
      emailVerificationExpiresAt: Date | null;
      emailVerifiedAt: Date | null;
    }[] = await ds.query(
      `SELECT "emailVerificationTokenHash", "emailVerificationExpiresAt", "emailVerifiedAt"
         FROM users WHERE id = $1`,
      [(res.body as { user: { id: string } }).user.id],
    );
    expect(rows[0].emailVerificationTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].emailVerificationExpiresAt).not.toBeNull();
    expect(rows[0].emailVerifiedAt).toBeNull();
  });

  it('verifica el correo con un token válido y audita', async () => {
    const user = await createUser(ds, { emailVerifiedAt: null });
    const token = await issueKnownToken(user);

    const res = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token });

    expect(res.status).toBe(200);

    const rows: {
      emailVerifiedAt: Date | null;
      emailVerificationTokenHash: string | null;
    }[] = await ds.query(
      `SELECT "emailVerifiedAt", "emailVerificationTokenHash" FROM users WHERE id = $1`,
      [user.id],
    );
    expect(rows[0].emailVerifiedAt).not.toBeNull();
    expect(rows[0].emailVerificationTokenHash).toBeNull();

    const logs: { action: string }[] = await ds.query(
      `SELECT action FROM audit_logs WHERE entity = 'user' AND "entityId" = $1 AND action = 'user.email_verified'`,
      [user.id],
    );
    expect(logs).toHaveLength(1);
  });

  it('responde 400 con un token que no existe', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: 'token-que-no-existe' });
    expect(res.status).toBe(400);
  });

  it('responde 400 con un token vencido', async () => {
    const user = await createUser(ds, { emailVerifiedAt: null });
    const token = await issueKnownToken(user, -1_000);

    const res = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token });

    expect(res.status).toBe(400);
  });

  it('resend-verification emite un hash nuevo', async () => {
    const user = await createUser(ds, { emailVerifiedAt: null });
    await issueKnownToken(user);
    const [{ emailVerificationTokenHash: before }]: {
      emailVerificationTokenHash: string;
    }[] = await ds.query(
      `SELECT "emailVerificationTokenHash" FROM users WHERE id = $1`,
      [user.id],
    );

    const res = await request(app.getHttpServer())
      .post('/auth/resend-verification')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(204);
    const [{ emailVerificationTokenHash: after }]: {
      emailVerificationTokenHash: string;
    }[] = await ds.query(
      `SELECT "emailVerificationTokenHash" FROM users WHERE id = $1`,
      [user.id],
    );
    expect(after).not.toBe(before);
  });

  it('resend-verification responde 409 si ya está verificado', async () => {
    const user = await createUser(ds, { emailVerifiedAt: new Date() });

    const res = await request(app.getHttpServer())
      .post('/auth/resend-verification')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(409);
  });

  it('resend-verification responde 401 sin sesión', async () => {
    const res = await request(app.getHttpServer()).post(
      '/auth/resend-verification',
    );
    expect(res.status).toBe(401);
  });
});
