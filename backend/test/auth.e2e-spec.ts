import { Controller, Get } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Roles } from '../src/common/decorators/roles.decorator';
import { Role } from '../src/database/enums';
import { createUser, TEST_PASSWORD } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

@Controller('test-admin')
class AdminProbeController {
  @Roles(Role.ADMIN)
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('Auth', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const http = () => request(app.getHttpServer());
  const register = (email = '  Cliente@Test.PE ') =>
    http()
      .post('/auth/register')
      .send({ email, password: TEST_PASSWORD, name: 'Cliente' });
  const login = (email: string, password = TEST_PASSWORD) =>
    http().post('/auth/login').send({ email, password });
  const refresh = (refreshToken: string) =>
    http().post('/auth/refresh').send({ refreshToken });
  const auditCount = async (action: string) => {
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM audit_logs WHERE action = $1`,
      [action],
    );
    return Number(count);
  };

  beforeAll(async () => {
    app = await createTestApp({ controllers: [AdminProbeController] });
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra como CUSTOMER y normaliza el correo', async () => {
    const res = await register().expect(201);
    expect(res.body.user).toMatchObject({
      email: 'cliente@test.pe',
      role: 'CUSTOMER',
      name: 'Cliente',
    });
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rechaza un campo role en el body', async () => {
    await http()
      .post('/auth/register')
      .send({ email: 'a@test.pe', password: TEST_PASSWORD, role: 'ADMIN' })
      .expect(400);
  });

  it('responde 409 si el correo ya existe', async () => {
    await register().expect(201);
    const res = await register('cliente@test.pe').expect(409);
    expect(res.body.message).toBe('Ya existe una cuenta con ese correo');
  });

  it('inicia sesión con credenciales correctas', async () => {
    await register();
    const res = await login('CLIENTE@test.pe').expect(200);
    expect(res.body.user.email).toBe('cliente@test.pe');
  });

  it('responde 401 genérico y audita los intentos fallidos', async () => {
    await register();
    const wrongPassword = await login(
      'cliente@test.pe',
      'otra-clave-123',
    ).expect(401);
    const unknownEmail = await login('nadie@test.pe').expect(401);
    expect(wrongPassword.body.message).toBe('Correo o contraseña incorrectos');
    expect(unknownEmail.body.message).toBe('Correo o contraseña incorrectos');
    expect(await auditCount('auth.login_failed')).toBe(2);
  });

  it('GET /auth/me devuelve el perfil sin datos sensibles', async () => {
    const { body } = await register();
    const res = await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'email',
      'emailVerifiedAt',
      'id',
      'name',
      'phone',
      'role',
    ]);
  });

  it('responde 401 sin token', async () => {
    const res = await http().get('/auth/me').expect(401);
    expect(res.body.message).toBe('Debes iniciar sesión');
  });

  it('responde 403 a un CUSTOMER en una ruta ADMIN y 200 a un ADMIN', async () => {
    const customer = await createUser(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const jwt = app.get(JwtService);
    await http()
      .get('/test-admin')
      .set(
        'Authorization',
        `Bearer ${jwt.sign({ sub: customer.id, role: customer.role })}`,
      )
      .expect(403);
    await http()
      .get('/test-admin')
      .set(
        'Authorization',
        `Bearer ${jwt.sign({ sub: admin.id, role: admin.role })}`,
      )
      .expect(200, { ok: true });
  });

  describe('refresh', () => {
    it('rota: entrega un par nuevo y marca el usado como ROTATED', async () => {
      const { body } = await register();
      const res = await refresh(body.refreshToken).expect(200);
      expect(res.body.refreshToken).not.toBe(body.refreshToken);
      expect(typeof res.body.accessToken).toBe('string');
      const rows: { revokedReason: string | null }[] = await ds.query(
        `SELECT "revokedReason" FROM refresh_tokens ORDER BY "createdAt"`,
      );
      expect(rows.map((r) => r.revokedReason)).toEqual(['ROTATED', null]);
    });

    it('reuso dentro de 30 s emite otro token sin revocar la familia', async () => {
      const { body } = await register();
      const r2 = (await refresh(body.refreshToken).expect(200)).body
        .refreshToken as string;
      const r3 = (await refresh(body.refreshToken).expect(200)).body
        .refreshToken as string;
      expect(r3).not.toBe(r2);
      await refresh(r2).expect(200);
      await refresh(r3).expect(200);
    });

    it('reuso fuera de la ventana revoca toda la familia', async () => {
      const { body } = await register();
      const r2 = (await refresh(body.refreshToken).expect(200)).body
        .refreshToken as string;
      await ds.query(
        `UPDATE refresh_tokens SET "revokedAt" = now() - interval '1 minute' WHERE "revokedReason" = 'ROTATED'`,
      );
      await refresh(body.refreshToken).expect(401);
      await refresh(r2).expect(401);
      expect(
        await auditCount('auth.refresh_reuse_detected'),
      ).toBeGreaterThanOrEqual(1);
    });

    it('dos refresh simultáneos con el mismo token tienen éxito y la familia sigue activa', async () => {
      const { body } = await register();
      const [a, b] = await Promise.all([
        refresh(body.refreshToken),
        refresh(body.refreshToken),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      await refresh(a.body.refreshToken as string).expect(200);
      await refresh(b.body.refreshToken as string).expect(200);
    });

    it('un token desconocido da 401', async () => {
      await refresh('token-que-no-existe').expect(401);
    });

    it('logout revoca la familia', async () => {
      const { body } = await register();
      await http()
        .post('/auth/logout')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ refreshToken: body.refreshToken })
        .expect(204);
      await refresh(body.refreshToken).expect(401);
    });
  });

  it('limita los intentos de login: el sexto en un minuto da 429', async () => {
    process.env.THROTTLE_ENABLED = 'true';
    try {
      for (let i = 0; i < 5; i++) {
        await login('nadie@test.pe').expect(401);
      }
      const res = await login('nadie@test.pe').expect(429);
      expect(res.body.message).toBe('Demasiados intentos, espera un momento');
    } finally {
      process.env.THROTTLE_ENABLED = 'false';
    }
  });
});
