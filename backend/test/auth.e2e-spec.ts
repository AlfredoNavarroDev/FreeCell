import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    it('reuso fuera de la ventana en paralelo con una rotación legítima no deja ningún token vivo', async () => {
      // Reproduce la condición de carrera del hallazgo de seguridad: un token viejo (ya rotado,
      // fuera de la ventana de gracia) se reusa justo cuando el usuario legítimo hace su propio
      // refresh rutinario con el token vigente de la misma familia. Sin el mutex por familia,
      // el UPDATE masivo de la revocación por reuso podía no ver el token hijo que la rotación
      // legítima concurrente estaba insertando, dejándolo vivo hasta 30 días: una sola repetición
      // no alcanza para disparar la carrera de forma confiable (depende de la ventana exacta de
      // entrelazado entre las dos transacciones), así que se repite varias veces con familias
      // nuevas; sin el mutex, esto reproducía un huérfano antes de la 5.ª iteración en la práctica.
      for (let i = 0; i < 15; i++) {
        const { body } = await register(`race-${i}-${Math.random()}@test.pe`);
        const vigente = (await refresh(body.refreshToken).expect(200)).body
          .refreshToken as string;
        await ds.query(
          `UPDATE refresh_tokens SET "revokedAt" = now() - interval '1 minute' WHERE "revokedReason" = 'ROTATED'`,
        );
        const [reuso, legitima] = await Promise.all([
          refresh(body.refreshToken),
          refresh(vigente),
        ]);
        // El reuso del token viejo siempre se detecta y responde 401.
        expect([reuso.status, legitima.status]).toContain(401);
        // Si la rotación legítima llegó a completarse antes del barrido, su token hijo
        // también debe quedar revocado: no debe sobrevivir ningún token vivo de la familia.
        if (legitima.status === 200) {
          await refresh(legitima.body.refreshToken as string).expect(401);
        }
        const rows: { revokedAt: string | null }[] = await ds.query(
          `SELECT "revokedAt" FROM refresh_tokens WHERE "userId" = $1`,
          [body.user.id],
        );
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
      }
      expect(
        await auditCount('auth.refresh_reuse_detected'),
      ).toBeGreaterThanOrEqual(1);
    });

    it('logout en paralelo con una rotación legítima no deja ningún token vivo', async () => {
      // Mismo hallazgo que el test de reuso de arriba, pero la contraparte concurrente es un
      // logout (revokeFamily) en vez de un barrido de reuso: sin el mutex por familia en
      // revokeFamily, el UPDATE masivo de LOGOUT podía no ver el token hijo que una rotación
      // legítima concurrente estaba insertando, dejándolo vivo hasta 30 días pese al logout.
      // Una sola repetición no alcanza para disparar la carrera de forma confiable, así que se
      // repite varias veces con familias nuevas.
      for (let i = 0; i < 15; i++) {
        const { body } = await register(
          `logout-race-${i}-${Math.random()}@test.pe`,
        );
        const [logoutRes, refreshRes] = await Promise.all([
          http()
            .post('/auth/logout')
            .set('Authorization', `Bearer ${body.accessToken}`)
            .send({ refreshToken: body.refreshToken }),
          refresh(body.refreshToken),
        ]);
        expect(logoutRes.status).toBe(204);
        // Si la rotación legítima llegó a completarse antes del logout, su token hijo también
        // debe quedar revocado: no debe sobrevivir ningún token vivo de la familia.
        if (refreshRes.status === 200) {
          await refresh(refreshRes.body.refreshToken as string).expect(401);
        }
        const rows: { revokedAt: string | null }[] = await ds.query(
          `SELECT "revokedAt" FROM refresh_tokens WHERE "userId" = $1`,
          [body.user.id],
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
      }
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
    // El guard lee THROTTLE_ENABLED de ConfigService (Minor 6), que cachea el valor validado al
    // arrancar: mutar `process.env` en caliente ya no lo cambia. `ConfigService.set()` sí actualiza
    // ese valor en caliente (y de paso `process.env`), que es como esta prueba lo activa solo aquí.
    const config = app.get(ConfigService);
    config.set('THROTTLE_ENABLED', true);
    try {
      for (let i = 0; i < 5; i++) {
        await login('nadie@test.pe').expect(401);
      }
      const res = await login('nadie@test.pe').expect(429);
      expect(res.body.message).toBe('Demasiados intentos, espera un momento');
    } finally {
      config.set('THROTTLE_ENABLED', false);
    }
  });
});
