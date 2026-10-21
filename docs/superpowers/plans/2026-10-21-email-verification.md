# Verificación de correo obligatoria + límite de cliente nuevo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RF-AUT-07/D22: el cliente debe verificar su correo antes de comprar (cuentas correo+contraseña; Google queda auto-verificado por D54, pero el login con Google todavía no existe — `POST /auth/google` es otra tarea de Sprint 2, fuera de este plan). Mientras el cliente sea "nuevo", sus pedidos tienen un tope de monto por moneda, placeholder hasta que el negocio dé la cifra real.

**Architecture:** `users` gana dos columnas nuevas (`emailVerificationTokenHash`, `emailVerificationExpiresAt`) — `emailVerifiedAt` ya existe desde Sprint 1 y nunca se usaba. `AuthService.register()` emite un token de un solo uso (hash SHA-256 guardado, nunca el valor en claro) y encola un correo con el enlace (reutiliza el `NotificationsService` ya existente, canal `log` de Fundaciones — el canal real de Resend es trabajo futuro sin código que tocar aquí). `POST /auth/verify-email` consume el token; `POST /auth/resend-verification` emite uno nuevo. `OrdersService.create()` exige `emailVerifiedAt` no nulo y, si el cliente tiene menos de `N` pedidos `DELIVERED` (configurable, D74), aplica un tope de `totalCents` por moneda (configurable vía `settings`, mismo patrón que el TTL de reserva).

**Tech Stack:** NestJS 11, TypeORM 0.3, `node:crypto` (igual que `CryptoService`/refresh tokens), Jest + Supertest (e2e reales).

**Spec:** `docs/02-requerimientos-funcionales.md` (RF-AUT-07), `docs/06-api.md` (filas nuevas de `/auth`), `docs/09-decisiones-y-preguntas-abiertas.md` (D14, D22, D53, D54; **D74 nueva en este plan**), `docs/05-modelo-de-datos.md` (columnas nuevas en `users`).

## Decisión nueva de este plan (para registrar en Task 3)

- **D74**: D22 deja el monto máximo del primer pedido como placeholder (`[X soles, placeholder]`) y dice que "sube tras 1–2 compras aprobadas sin reclamo". Como el módulo `claims` todavía no existe (Sprint 3/4) y el flujo de aprobación de pagos tampoco (Sprint 3), este plan define el criterio **implementable hoy**: el tope aplica mientras el cliente tenga **menos de `newCustomerGraceOrders` pedidos en estado `DELIVERED`** (sin condición de "sin reclamo" todavía — se añade cuando exista `claims`). El tope es **por moneda** (`newCustomerMaxOrderCentsPen`/`...Usd`, D61: sin conversión entre monedas), configurable en `settings` (mismo mecanismo que el TTL de reserva), con valores de arranque marcados como placeholder de negocio: `newCustomerGraceOrders = 1`, `newCustomerMaxOrderCentsPen = 50000` (S/ 500), `newCustomerMaxOrderCentsUsd = 15000` ($ 150). Joseph puede cambiarlos por SQL/seed sin redeploy hasta que exista el CRUD de `settings` (RF-ADM-42, Sprint 3).

## Global Constraints

- Entidades, rutas y código en **inglés**; mensajes al usuario y documentación en **español**.
- DTOs con `class-validator` (whitelist ya activado globalmente).
- `import type` para tipos puros; import de valor normal para lo inyectado por constructor DI.
- El token de verificación **nunca** se devuelve en ninguna respuesta HTTP ni se audita en claro — solo su hash viaja a la base. El enlace sale únicamente por el canal de notificaciones (regla 4 extendida por analogía: ningún secreto de un solo uso en logs/respuestas).
- Toda mutación crítica audita (regla 6): verificar el correo escribe `audit_logs` (`user.email_verified`).
- **No escribas manualmente un `catch` para violaciones de unicidad/trigger de Postgres**: `AllExceptionsFilter` ya las traduce a 409 (mismo patrón que los planes de `payments` y `orders-catalog-admin`).
- `npm run typecheck && npm test && npm run test:e2e` deben pasar en verde al final de cada tarea.
- **Riesgo real de regresión en Task 2**: el factory compartido `test/utils/factories.ts` → `createUser()` NO marca `emailVerifiedAt`; decenas de e2e existentes (`orders`, `concurrency`, `release`, `submit-payment`, `payment-upload-url`, `license-reveal`, `orders-list-detail`, etc.) crean pedidos con usuarios sin verificar. Task 2 **debe** cambiar el default de ese factory a verificado (`emailVerifiedAt: new Date()` antes de `...overrides`, para que los tests que sí necesitan un cliente sin verificar puedan seguir pasando `{ emailVerifiedAt: null }` explícito) — si no, la regresión completa de Task 2 rompe ~15 suites ajenas. Corre la suite completa, no solo el spec nuevo, antes de dar la tarea por terminada.
- Entorno de este worktree: Postgres en `localhost:5433`, Redis en `localhost:6380` (proyecto Docker `freecell-email-verification`). `npm run test:e2e` necesita el prefijo en el mismo comando:
  ```bash
  TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e
  ```
  Baseline verificada (2026-10-21): `npm run typecheck` limpio; `npm test` 39/39; `npm run test:e2e` 16 suites / 128 pruebas, todas en verde.
- **Nunca** corras `docker compose up` sin verificar antes que `backend/.env` de este worktree tenga `COMPOSE_PROJECT_NAME=freecell-email-verification` (ya lo tiene).

---

## Mapa de archivos

```
backend/
  src/
    database/
      entities/user.entity.ts                    Modificar: + emailVerificationTokenHash/ExpiresAt
      migrations/<timestamp>-AddEmailVerificationToUsers.ts   Crear
    notifications/notification.types.ts           Modificar: + 'email-verification' al union
    auth/
      auth.module.ts                              Modificar: importa NotificationsModule
      auth.service.ts                             Modificar: + verifyEmail, resendVerification, hook en register
      auth.controller.ts                          Modificar: + POST verify-email, resend-verification
      dto/verify-email.dto.ts                     Crear
    settings/settings.service.ts                  Modificar: + 3 constantes de claves nuevas
    orders/orders.service.ts                       Modificar: + guardas en create() (verificado + tope nuevo cliente)
  test/
    utils/factories.ts                             Modificar: createUser() verificado por defecto
    auth-email-verification.e2e-spec.ts            Crear
    orders-new-customer-limit.e2e-spec.ts          Crear
docs/
  02-requerimientos-funcionales.md                 Modificar: RF-AUT-07
  05-modelo-de-datos.md                            Modificar: columnas nuevas en users
  06-api.md                                        Modificar: filas /auth nuevas
  08-plan-de-sprints.md                            Modificar: checkbox
  09-decisiones-y-preguntas-abiertas.md            Modificar: + D74
```

---

### Task 1: Verificación de correo — token, envío, confirmación (RF-AUT-07)

**Files:**
- Modify: `backend/src/database/entities/user.entity.ts`
- Create: `backend/src/database/migrations/<timestamp>-AddEmailVerificationToUsers.ts`
- Modify: `backend/src/notifications/notification.types.ts`
- Modify: `backend/src/auth/auth.module.ts`
- Modify: `backend/src/auth/auth.service.ts`
- Modify: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/dto/verify-email.dto.ts`
- Create: `backend/test/auth-email-verification.e2e-spec.ts`

**Interfaces:**
- Produces: `AuthService.verifyEmail(dto)`, `AuthService.resendVerification(userId)`. No depende de Task 2.
- Task 2 **consume** el campo `emailVerifiedAt` que esta tarea empieza a poblar, pero esa columna ya existe desde Sprint 1 — Task 2 no necesita que Task 1 esté terminada para compilar ni para sus propios tests (usa `createUser(ds, { emailVerifiedAt: new Date() })` directo). Aun así, este plan las deja en secuencia porque ambas tocan la suite e2e completa.

- [ ] **Step 1: Migración — columnas de verificación**

En `backend/src/database/entities/user.entity.ts`, agrega después de `emailVerifiedAt`:

```typescript
  /** Hash SHA-256 (hex) del token de verificación vigente; null si ya se verificó o nunca se emitió. */
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  emailVerificationTokenHash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiresAt!: Date | null;
```

Genera la migración: `npm run migration:generate -- src/database/migrations/AddEmailVerificationToUsers` (desde `backend/`). Revisa que el archivo generado solo tenga las dos columnas nuevas de `users` (ambas `nullable`, sin `NOT NULL`, sin default) — si TypeORM arrastra drift de otra tabla, bórralo del archivo.

- [ ] **Step 2: Correr la migración**

Run: `npm run migration:run`
Expected: aplica sin errores.

- [ ] **Step 3: Nueva plantilla de notificación**

En `backend/src/notifications/notification.types.ts`, cambia:

```typescript
export type NotificationTemplate = 'order-created';
```

por:

```typescript
export type NotificationTemplate = 'order-created' | 'email-verification';
```

- [ ] **Step 4: DTO del token**

Crea `backend/src/auth/dto/verify-email.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty()
  @IsString({ message: 'token debe ser texto' })
  @Length(1, 200, { message: 'token inválido' })
  token!: string;
}
```

- [ ] **Step 5: Escribir el e2e (debe fallar: las rutas no existen)**

Crea `backend/test/auth-email-verification.e2e-spec.ts`:

```typescript
import { type NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/database/enums';
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
    const res = await request(app.getHttpServer()).post('/auth/register').send({
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

    const rows: { emailVerifiedAt: Date | null; emailVerificationTokenHash: string | null }[] =
      await ds.query(
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
    const [{ emailVerificationTokenHash: before }]: { emailVerificationTokenHash: string }[] =
      await ds.query(`SELECT "emailVerificationTokenHash" FROM users WHERE id = $1`, [user.id]);

    const res = await request(app.getHttpServer())
      .post('/auth/resend-verification')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(204);
    const [{ emailVerificationTokenHash: after }]: { emailVerificationTokenHash: string }[] =
      await ds.query(`SELECT "emailVerificationTokenHash" FROM users WHERE id = $1`, [user.id]);
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
    const res = await request(app.getHttpServer()).post('/auth/resend-verification');
    expect(res.status).toBe(401);
  });
});
```

(No hace falta `Role` arriba si no se usa — bórralo del import si el linter lo marca como no usado; se deja aquí por si lo necesitas al adaptar.)

- [ ] **Step 6: Correr el e2e y verificar que falla**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- auth-email-verification.e2e-spec.ts`
Expected: FAIL (las rutas `/auth/verify-email` y `/auth/resend-verification` no existen; el registro no deja token).

- [ ] **Step 7: `AuthModule` importa `NotificationsModule`**

En `backend/src/auth/auth.module.ts`, agrega el import:

```typescript
import { NotificationsModule } from '../notifications/notifications.module';
```

Y agrégalo a `imports` (junto a `UsersModule`):

```typescript
  imports: [
    UsersModule,
    NotificationsModule,
    PassportModule,
    ...
```

- [ ] **Step 8: `AuthService` — emitir, enviar, verificar, reenviar**

En `backend/src/auth/auth.service.ts`, agrega los imports:

```typescript
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { EnvironmentVariables } from '../core/config/env.validation';
import { NotificationsService } from '../notifications/notifications.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
```

(Combina con los imports ya existentes de `@nestjs/common` en vez de duplicar la línea; `ConflictException`/`UnauthorizedException` ya están importados ahí.)

Agrega la constante de TTL cerca de `BCRYPT_COST`:

```typescript
const EMAIL_VERIFICATION_TTL_HOURS = 24;
```

Agrega `logger`, `notifications` y `config` a la clase:

```typescript
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}
```

Reemplaza `register(...)` por:

```typescript
  /** El rol siempre es CUSTOMER: ADMIN solo por seed (RF-AUT-04). */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = UsersService.normalizeEmail(dto.email);
    const passwordHash = await hash(dto.password, BCRYPT_COST);
    const { response, user, verificationToken } = await this.ds.transaction(
      async (m) => {
        if (await m.exists(User, { where: { email } })) {
          throw new ConflictException('Ya existe una cuenta con ese correo');
        }
        const user = await m.save(
          User,
          m.create(User, {
            email,
            passwordHash,
            name: dto.name?.trim() || null,
            role: Role.CUSTOMER,
          }),
        );
        const verificationToken = await this.issueEmailVerification(m, user);
        const response = await this.buildAuthResponse(m, user);
        return { response, user, verificationToken };
      },
    );
    await this.sendVerificationEmail(user, verificationToken);
    return response;
  }

  /** RF-AUT-07: confirma el correo con el token de un solo uso (hash, nunca en claro). */
  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    await this.ds.transaction(async (m) => {
      const user = await m
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.emailVerificationTokenHash')
        .where('user.emailVerificationTokenHash = :tokenHash', { tokenHash })
        .getOne();
      if (
        !user ||
        !user.emailVerificationExpiresAt ||
        user.emailVerificationExpiresAt.getTime() < Date.now()
      ) {
        throw new BadRequestException(
          'El enlace de verificación es inválido o venció',
        );
      }
      await m.update(User, { id: user.id }, {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      });
      await this.audit.log(m, {
        actorId: user.id,
        action: 'user.email_verified',
        entity: 'user',
        entityId: user.id,
      });
    });
  }

  /** Reemite el token si el correo todavía no está verificado. */
  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Debes iniciar sesión');
    }
    if (user.emailVerifiedAt) {
      throw new ConflictException('Tu correo ya está verificado');
    }
    const token = await this.ds.transaction((m) =>
      this.issueEmailVerification(m, user),
    );
    await this.sendVerificationEmail(user, token);
  }
```

Agrega los dos helpers privados nuevos, cerca de `signAccess`:

```typescript
  private async issueEmailVerification(
    manager: EntityManager,
    user: User,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await manager.update(User, { id: user.id }, {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: new Date(
        Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 3_600_000,
      ),
    });
    return token;
  }

  /** Si falla el envío, el registro/reenvío no se cae: el cliente puede pedir otro con resend-verification. */
  private async sendVerificationEmail(user: User, token: string): Promise<void> {
    try {
      const frontendUrl = this.config.get('CORS_ORIGIN', { infer: true });
      await this.notifications.enqueue({
        key: `email-verification-${user.id}-${token.slice(0, 8)}`,
        template: 'email-verification',
        recipient: user.email,
        data: { verifyUrl: `${frontendUrl}/verify-email?token=${token}` },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(
        { err, userId: user.id },
        'No se pudo encolar el correo de verificación',
      );
    }
  }
```

- [ ] **Step 9: Rutas en `AuthController`**

En `backend/src/auth/auth.controller.ts`, agrega el import:

```typescript
import { VerifyEmailDto } from './dto/verify-email.dto';
```

Agrega los dos métodos, después de `refresh(...)`:

```typescript
  @Public()
  @Throttle({ default: { limit: 10, ttl: PER_MINUTE } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    return this.auth.verifyEmail(dto);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: PER_MINUTE } })
  @HttpCode(204)
  @Post('resend-verification')
  resendVerification(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.auth.resendVerification(user.id);
  }
```

- [ ] **Step 10: Correr el e2e nuevo y verificar que pasa**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- auth-email-verification.e2e-spec.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 11: Regresión completa**

Run: `npm run typecheck && npm test && TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e`
Expected: todo en verde — en particular `auth.e2e-spec.ts` (si existe) sigue pasando: `register` ahora hace más trabajo (emite token, encola notificación) pero la forma de la respuesta no cambia.

- [ ] **Step 12: Commit**

```bash
git add backend/src/database/entities/user.entity.ts backend/src/database/migrations backend/src/notifications/notification.types.ts backend/src/auth backend/test/auth-email-verification.e2e-spec.ts
git commit -m "Backend: verificación de correo obligatoria con token de un solo uso (RF-AUT-07)"
```

---

### Task 2: Tope de monto para cliente nuevo + exigir correo verificado al comprar (D22/D74)

**Files:**
- Modify: `backend/src/settings/settings.service.ts`
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/test/utils/factories.ts`
- Create: `backend/test/orders-new-customer-limit.e2e-spec.ts`

**Interfaces:**
- Consume: `User.emailVerifiedAt` (ya existe desde Sprint 1; no requiere que Task 1 esté terminada).
- No depende de Task 1 para compilar ni para sus pruebas — las aísla con `createUser(ds, { emailVerifiedAt: ... })` directo. Se deja después de Task 1 solo por la suite e2e compartida.

- [ ] **Step 1: Arreglar el factory compartido primero (antes que nada)**

En `backend/test/utils/factories.ts`, en `createUser`, agrega `emailVerifiedAt: new Date()` **antes** de `...overrides` (para que overrides pueda seguir poniendo `null` cuando un test necesite un cliente sin verificar):

```typescript
export async function createUser(
  ds: DataSource,
  overrides: Partial<User> = {},
): Promise<User> {
  const repo = ds.getRepository(User);
  const user = await repo.save(
    repo.create({
      email: `user-${randomUUID()}@test.pe`,
      passwordHash: TEST_PASSWORD_HASH,
      role: Role.CUSTOMER,
      emailVerifiedAt: new Date(),
      ...overrides,
    }),
  );
  return user;
}
```

Después de este cambio, corre ANTES de seguir con el resto de la tarea: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e` completo (sin el `create()` del Step 4 todavía tocado) — debe seguir en 128/128 verde, porque este cambio por sí solo no agrega ninguna restricción nueva, solo deja a los clientes de prueba "ya verificados" (que es el estado por defecto correcto para pruebas que no son sobre verificación).

- [ ] **Step 2: Constantes de settings nuevas**

En `backend/src/settings/settings.service.ts`, agrega después de `SETTING_RESERVATION_TTL_MINUTES`:

```typescript
/** D74: placeholder de negocio hasta que Joseph dé la cifra real. */
export const SETTING_NEW_CUSTOMER_GRACE_ORDERS = 'newCustomerGraceOrders';
export const SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_PEN =
  'newCustomerMaxOrderCentsPen';
export const SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_USD =
  'newCustomerMaxOrderCentsUsd';
```

(No hace falta tocar la clase `SettingsService`: `getNumber(key, fallback)` ya sirve para cualquier clave nueva.)

- [ ] **Step 3: Escribir el e2e (debe fallar: todavía no hay restricción)**

Crea `backend/test/orders-new-customer-limit.e2e-spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OrderStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Correo verificado + tope de cliente nuevo al crear un pedido (RF-AUT-07, D22/D74)', () => {
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

  it('responde 403 si el correo no está verificado', async () => {
    const user = await createUser(ds, { emailVerifiedAt: null });
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 1000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(403);
  });

  it('cliente verificado y nuevo: un pedido dentro del tope pasa', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 1000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(201);
  });

  it('cliente verificado y nuevo: un pedido que supera el tope en PEN responde 409', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 100_000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(409);
  });

  it('el tope se aplica por separado en USD', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 1,
      prices: { USD: 50_000 },
    });

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'USD', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(409);
  });

  it('tras alcanzar newCustomerGraceOrders pedidos DELIVERED, el tope ya no aplica', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, {
      stock: 2,
      prices: { PEN: 100_000 },
    });

    // Simula un pedido DELIVERED previo (el flujo real de aprobación es Sprint 3).
    await ds.query(
      `INSERT INTO orders ("userId", status, "totalCents", currency, "expiresAt")
       VALUES ($1, 'DELIVERED', 1000, 'PEN', now())`,
      [user.id],
    );

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ currency: 'PEN', items: [{ planId: catalog.plan.id, qty: 1 }] });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 4: Correr el e2e y verificar que falla**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- orders-new-customer-limit.e2e-spec.ts`
Expected: FAIL — las pruebas 1, 3 y 4 (403/409 esperados) reciben 201 porque la restricción no existe todavía.

- [ ] **Step 5: Guardas en `OrdersService.create`**

En `backend/src/orders/orders.service.ts`, agrega el import:

```typescript
import { ForbiddenException } from '@nestjs/common';
```

(combínalo con el import existente de `@nestjs/common`, no una línea nueva) y:

```typescript
import {
  SETTING_NEW_CUSTOMER_GRACE_ORDERS,
  SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_PEN,
  SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_USD,
  SETTING_RESERVATION_TTL_MINUTES,
  SettingsService,
} from '../settings/settings.service';
```

(ya existe el import de `SETTING_RESERVATION_TTL_MINUTES`/`SettingsService`: amplíalo con las 3 constantes nuevas en vez de duplicar la línea).

Al inicio de `create(...)`, antes de `const ttlMinutes = ...`, agrega:

```typescript
    const owner = await this.users.findById(user.id);
    if (!owner?.emailVerifiedAt) {
      throw new ForbiddenException('Verifica tu correo antes de comprar');
    }
```

Después de calcular `ttlMinutes` (misma línea de contexto donde ya se leen settings), agrega:

```typescript
    const graceOrders = await this.settings.getNumber(
      SETTING_NEW_CUSTOMER_GRACE_ORDERS,
      1,
    );
    const deliveredCount = await this.ds.getRepository(Order).count({
      where: { userId: user.id, status: OrderStatus.DELIVERED },
    });
    const isNewCustomer = deliveredCount < graceOrders;
```

Dentro de la transacción, justo después de calcular `totalCents` (antes de `m.save(Order, ...)`), agrega:

```typescript
      if (isNewCustomer) {
        const maxCents = await this.settings.getNumber(
          dto.currency === 'USD'
            ? SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_USD
            : SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_PEN,
          dto.currency === 'USD' ? 15_000 : 50_000,
        );
        if (totalCents > maxCents) {
          throw new ConflictException(
            'Tu pedido supera el límite para clientes nuevos; contacta soporte si necesitas comprar más',
          );
        }
      }
```

(`ConflictException` ya está importado en este archivo.)

- [ ] **Step 6: Correr el e2e nuevo y verificar que pasa**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- orders-new-customer-limit.e2e-spec.ts`
Expected: PASS (5 pruebas).

- [ ] **Step 7: Regresión completa**

Run: `npm run typecheck && npm test && TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e`
Expected: todo en verde. Si algo de `orders`/`concurrency`/`release`/`submit-payment`/`payment-upload-url`/`license-reveal`/`orders-list-detail`/`catalog-admin` falla con 403, es porque el Step 1 de esta tarea (factory verificado por defecto) no se aplicó correctamente — revísalo antes de seguir.

- [ ] **Step 8: Commit**

```bash
git add backend/src/settings/settings.service.ts backend/src/orders/orders.service.ts backend/test/utils/factories.ts backend/test/orders-new-customer-limit.e2e-spec.ts
git commit -m "Backend: exige correo verificado y tope de monto para cliente nuevo al comprar (D22/D74)"
```

---

### Task 3: Documentación

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md`
- Modify: `docs/05-modelo-de-datos.md`
- Modify: `docs/06-api.md`
- Modify: `docs/08-plan-de-sprints.md`
- Modify: `docs/09-decisiones-y-preguntas-abiertas.md`

**Interfaces:** (ninguna — solo texto)

- [ ] **Step 1: Registrar D74**

En `docs/09-decisiones-y-preguntas-abiertas.md`, agrega una sección nueva después de la sección D73 (pedidos/reveal, Sprint 2):

```markdown
### Decisión de verificación de correo / cliente nuevo — Sprint 2 (2026-10-21)
| Id | Decisión | Razón |
|---|---|---|
| D74 | El tope de D22 aplica mientras el cliente tenga **menos de `newCustomerGraceOrders` pedidos `DELIVERED`** (placeholder: 1), por moneda (`newCustomerMaxOrderCentsPen`/`...Usd`, placeholders S/ 500 / $ 150, D61: sin conversión). La condición "sin reclamo" de D22 queda pendiente hasta que exista el módulo `claims` (Sprint 3/4). | D22 depende de `claims` y de la aprobación de pagos, que no existen todavía; este criterio es el implementable hoy y se endurece cuando esos módulos lleguen. |
```

- [ ] **Step 2: Actualizar RF-AUT-07**

En `docs/02-requerimientos-funcionales.md`, reemplaza:

```markdown
| RF-AUT-07 | Verificación de correo **obligatoria** antes de la primera compra para cuentas correo+contraseña; **automática** si el usuario entró con Google (D22, D54). | M | ⬜ |
```

por:

```markdown
| RF-AUT-07 | Verificación de correo **obligatoria** antes de la primera compra para cuentas correo+contraseña; **automática** si el usuario entró con Google (D22, D54). | M | 🟡 (verificación + tope de cliente nuevo ✅, D74; falta `POST /auth/google` para la auto-verificación, Sprint 2) |
```

- [ ] **Step 3: Modelo de datos**

En `docs/05-modelo-de-datos.md`, busca la fila de `users` y agrega las columnas nuevas junto a `emailVerifiedAt` (si la fila no menciona `emailVerifiedAt` explícitamente, agrégala también para que quede completa — no la inventes si el resto de la fila usa una descripción genérica; en ese caso, agrega una nota aparte bajo la tabla en vez de reescribir la fila entera).

- [ ] **Step 4: Filas de la API**

En `docs/06-api.md`, en la sección de `/auth`, agrega (con el mismo formato de columnas que ya usan las filas de `auth` existentes en ese archivo — revísalo antes de pegar):

```markdown
| ✅ | `POST /auth/verify-email` | — | Body `{token}`. Marca `emailVerifiedAt`; 400 si el token es inválido o venció. |
| ✅ | `POST /auth/resend-verification` | 👤 | Reemite el token si el correo aún no está verificado; 409 si ya lo está. |
```

Y en la fila de `POST /orders` (o donde documente sus respuestas de error), agrega una nota: 403 si el correo no está verificado; 409 si el cliente nuevo supera el tope de D74.

- [ ] **Step 5: Checkbox del plan de sprints**

En `docs/08-plan-de-sprints.md`, reemplaza:

```markdown
- [ ] Verificación de correo obligatoria antes de la primera compra; límite de monto para cliente nuevo (RF-AUT-07, D22).
```

por:

```markdown
- [x] Verificación de correo obligatoria antes de la primera compra; límite de monto para cliente nuevo (RF-AUT-07, D22, D74).
```

- [ ] **Step 6: Commit**

```bash
git add docs/02-requerimientos-funcionales.md docs/05-modelo-de-datos.md docs/06-api.md docs/08-plan-de-sprints.md docs/09-decisiones-y-preguntas-abiertas.md
git commit -m "Docs: verificación de correo y tope de cliente nuevo — RF-AUT-07, D74"
```
