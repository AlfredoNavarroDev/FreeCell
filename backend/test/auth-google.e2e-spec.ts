import { UnauthorizedException } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { GoogleAuthService } from '../src/auth/google-auth.service';
import type { GoogleProfile } from '../src/auth/google-auth.service';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

/** Sustituye la verificación real (HTTP a Google) por perfiles fijados en cada prueba. */
class FakeGoogleAuthService {
  verifyIdToken(idToken: string): Promise<GoogleProfile> {
    if (idToken === 'invalid-token') {
      throw new UnauthorizedException('Token de Google inválido');
    }
    return Promise.resolve(JSON.parse(idToken) as GoogleProfile);
  }
}

function profileToken(profile: GoogleProfile): string {
  return JSON.stringify(profile);
}

describe('POST /auth/google (RF-AUT-10/D53/D54/D75)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(GoogleAuthService)
          .useClass(FakeGoogleAuthService),
    });
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('crea una cuenta nueva como CUSTOMER, verificada automáticamente', async () => {
    const profile: GoogleProfile = {
      googleId: 'google-sub-1',
      email: `nuevo-${Date.now()}@gmail.com`,
      emailVerified: true,
      name: 'Cliente Nuevo',
    };

    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: profileToken(profile) });

    expect(res.status).toBe(200);
    const body = res.body as {
      accessToken: string;
      refreshToken: string;
      user: { email: string; role: string };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe(profile.email);
    expect(body.user.role).toBe('CUSTOMER');

    const rows: { emailVerifiedAt: Date | null; googleId: string }[] =
      await ds.query(
        `SELECT "emailVerifiedAt", "googleId" FROM users WHERE email = $1`,
        [profile.email],
      );
    expect(rows[0].emailVerifiedAt).not.toBeNull();
    expect(rows[0].googleId).toBe(profile.googleId);
  });

  it('un segundo login con el mismo googleId entra a la misma cuenta (no duplica)', async () => {
    const profile: GoogleProfile = {
      googleId: 'google-sub-2',
      email: `repetido-${Date.now()}@gmail.com`,
      emailVerified: true,
      name: 'Cliente Repetido',
    };
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: profileToken(profile) });

    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: profileToken(profile) });

    expect(res.status).toBe(200);
    const rows: { count: string }[] = await ds.query(
      `SELECT COUNT(*)::text FROM users WHERE email = $1`,
      [profile.email],
    );
    expect(rows[0].count).toBe('1');
  });

  it('vincula una cuenta existente de correo+contraseña por el mismo correo (D75) y audita', async () => {
    const email = `vincular-${Date.now()}@test.pe`;
    const existing = await createUser(ds, { email, emailVerifiedAt: null });

    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({
        idToken: profileToken({
          googleId: 'google-sub-link',
          email,
          emailVerified: true,
          name: 'Vinculado',
        }),
      });

    expect(res.status).toBe(200);
    const body = res.body as { user: { email: string } };
    expect(body.user.email).toBe(email);

    const rows: { id: string; googleId: string; emailVerifiedAt: Date | null }[] =
      await ds.query(
        `SELECT id, "googleId", "emailVerifiedAt" FROM users WHERE id = $1`,
        [existing.id],
      );
    expect(rows[0].googleId).toBe('google-sub-link');
    expect(rows[0].emailVerifiedAt).not.toBeNull();

    const logs: { action: string }[] = await ds.query(
      `SELECT action FROM audit_logs WHERE entity = 'user' AND "entityId" = $1 AND action = 'user.google_linked'`,
      [existing.id],
    );
    expect(logs).toHaveLength(1);
  });

  it('responde 401 si Google no certifica el correo como verificado', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({
        idToken: profileToken({
          googleId: 'google-sub-unverified',
          email: `sin-verificar-${Date.now()}@gmail.com`,
          emailVerified: false,
          name: null,
        }),
      });

    expect(res.status).toBe(401);
  });

  it('responde 401 si el token de Google no es válido', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/google')
      .send({ idToken: 'invalid-token' });

    expect(res.status).toBe(401);
  });
});
