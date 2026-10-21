# POST /auth/google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RF-AUT-10/D53/D54: el backend recibe un ID token de Google (ya obtenido por el frontend/NextAuth en el flujo OAuth), lo **verifica criptográficamente él mismo** (nunca confía en que el frontend ya lo validó — el frontend es un cliente no confiable), y hace find-or-create por correo: cuenta nueva → `role=CUSTOMER`, `emailVerifiedAt` automático (D54); cuenta existente con ese `googleId` → login; cuenta existente con ese correo pero sin `googleId` (se registró con contraseña) → se **vincula** la cuenta de Google (mismo correo, mismo dueño verificado por dos medios independientes). Devuelve el mismo `AuthResponseDto` que `login`/`register` (par de tokens + usuario), para que el frontend (NextAuth) lo trate igual que cualquier otro login.

**Architecture:** `GoogleAuthService` nuevo (en el módulo `auth`) envuelve `google-auth-library` (`OAuth2Client.verifyIdToken`, verificación real contra las claves públicas de Google — HTTP real, no se puede falsear con credenciales de prueba como el firmado local de `storage`). Por eso queda **inyectado y reemplazable en los tests** vía el hook `configure` que ya expone `test/utils/test-app.ts::createTestApp` (`overrideProvider`), sin tocar ese helper compartido ni depender de red real en los e2e. `AuthService.loginWithGoogle(dto)` usa el perfil verificado para el find-or-create/link y reutiliza `buildAuthResponse` (mismo mecanismo de tokens que `login`/`register`, Sprint 1).

**Tech Stack:** NestJS 11, TypeORM 0.3, `google-auth-library` (nueva dependencia, CommonJS — confirmado `"main": "./build/src/index.js"`, sin restricción del CLAUDE.md que solo aplica a `@nestjs/config`/`jwt`/`passport`/`bullmq`/`typeorm`), Jest + Supertest.

**Spec:** `docs/02-requerimientos-funcionales.md` (RF-AUT-10), `docs/06-api.md` (fila `POST /auth/google`), `docs/09-decisiones-y-preguntas-abiertas.md` (D53, D54; **D75 nueva en este plan**), `docs/04-arquitectura.md` (línea de NextAuth/Google).

## Decisión nueva de este plan (para registrar en Task 2)

- **D75**: Si el correo de Google ya existe en `users` **sin** `googleId` (se registró antes con contraseña), `POST /auth/google` **vincula** la cuenta de Google a esa cuenta existente en vez de rechazar o crear una cuenta duplicada — audita `user.google_linked`. _Razón:_ D53/D54 no cubren este caso explícitamente; rechazar frustraría a un cliente que ya tiene cuenta y solo quiere entrar más rápido, y crear una cuenta duplicada con el mismo correo violaría el único de `users.email`. Vincular es seguro porque ambos medios (contraseña + verificación de correo propia, o la verificación de correo de Google) ya probaron que esa persona controla ese correo.

## Global Constraints

- Entidades, rutas y código en **inglés**; mensajes al usuario y documentación en **español**.
- DTOs con `class-validator` (whitelist ya activado globalmente).
- `import type` para tipos puros; import de valor normal para lo inyectado por constructor DI.
- **El backend verifica el ID token él mismo** (firma, audiencia = `GOOGLE_CLIENT_ID`, emisor) — nunca confía en un campo `email`/`sub` que venga suelto en el body sin pasar por `OAuth2Client.verifyIdToken`. Si Google reporta `email_verified: false` en el payload, se rechaza (401): no tiene sentido confiar en D54 si ni Google mismo certificó ese correo.
- Toda mutación crítica audita (regla 6): vincular una cuenta de Google a una cuenta existente escribe `audit_logs` (`user.google_linked`). Crear una cuenta nueva (vía Google o vía `register`) **no** se audita individualmente — mismo criterio que ya usa `register()` hoy (sin precedente de auditar altas de cuenta, solo acciones de seguridad puntuales como `auth.login_failed`, `user.email_verified`).
- **No escribas manualmente un `catch` para violaciones de unicidad/trigger de Postgres**: `AllExceptionsFilter` ya las traduce a 409 (mismo patrón de los planes anteriores de Sprint 2).
- `npm run typecheck && npm test && npm run test:e2e` deben pasar en verde al final de cada tarea.
- Entorno de este worktree: Postgres en `localhost:5433`, Redis en `localhost:6380` (proyecto Docker `freecell-google-auth`). `npm run test:e2e` necesita el prefijo en el mismo comando:
  ```bash
  TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e
  ```
  Baseline verificada (2026-10-21): `npm run typecheck` limpio; `npm test` 39/39; `npm run test:e2e` 18 suites / 140 pruebas, todas en verde. `google-auth-library@11.3.1` ya está instalado en este worktree (`npm install google-auth-library`, CommonJS confirmado).
- **Nunca** corras `docker compose up` sin verificar antes que `backend/.env` de este worktree tenga `COMPOSE_PROJECT_NAME=freecell-google-auth` (ya lo tiene).

---

## Mapa de archivos

```
backend/
  src/
    core/config/env.validation.ts        Modificar: + GOOGLE_CLIENT_ID
    .env.example                          Modificar: + GOOGLE_CLIENT_ID
    auth/
      google-auth.service.ts              Crear
      auth.module.ts                      Modificar: + GoogleAuthService a providers
      auth.service.ts                     Modificar: + loginWithGoogle, inyecta GoogleAuthService
      auth.controller.ts                  Modificar: + POST /auth/google
      dto/google-login.dto.ts             Crear
  test/
    auth-google.e2e-spec.ts               Crear
docs/
  02-requerimientos-funcionales.md         Modificar: RF-AUT-10
  04-arquitectura.md                       Modificar: nota de estado
  06-api.md                                Modificar: fila POST /auth/google
  08-plan-de-sprints.md                    Modificar: checkbox
  09-decisiones-y-preguntas-abiertas.md    Modificar: + D75
```

---

### Task 1: `POST /auth/google` (RF-AUT-10/D53/D54/D75)

**Files:**
- Modify: `backend/src/core/config/env.validation.ts`
- Modify: `backend/.env.example`
- Create: `backend/src/auth/google-auth.service.ts`
- Modify: `backend/src/auth/auth.module.ts`
- Modify: `backend/src/auth/auth.service.ts`
- Modify: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/dto/google-login.dto.ts`
- Create: `backend/test/auth-google.e2e-spec.ts`

**Interfaces:**
- Produces: `GoogleAuthService.verifyIdToken(idToken): Promise<GoogleProfile>`, `AuthService.loginWithGoogle(dto): Promise<AuthResponseDto>`.
- Esta es la única tarea de código del plan (self-contained).

- [ ] **Step 1: `GOOGLE_CLIENT_ID` en la configuración**

En `backend/src/core/config/env.validation.ts`, agrega después del bloque de `R2_*` (antes de `CORS_ORIGIN`):

```typescript
  /** Audience esperado al verificar el ID token de Google (RF-AUT-10, D53). */
  @IsString()
  GOOGLE_CLIENT_ID!: string;
```

En `backend/.env.example`, agrega después de la línea `R2_BUCKET=[nombre-del-bucket-privado-de-comprobantes]`:

```
# Google OAuth (login con Google, D53). Client ID del proyecto en Google Cloud Console →
# APIs & Services → Credentials → OAuth 2.0 Client IDs (tipo "Web application").
GOOGLE_CLIENT_ID=[tu-client-id].apps.googleusercontent.com
```

- [ ] **Step 2: `GoogleAuthService`**

Crea `backend/src/auth/google-auth.service.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { EnvironmentVariables } from '../core/config/env.validation';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Verificación real contra las claves públicas de Google (RF-AUT-10). No hay forma de probar
 * esto con credenciales ficticias como `storage` (la firma SigV4 es local; esta no): en los e2e
 * se reemplaza por `overrideProvider(GoogleAuthService)` vía el hook `configure` de `createTestApp`.
 */
@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
    this.client = new OAuth2Client(this.clientId);
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    let payload: ReturnType<
      Awaited<ReturnType<OAuth2Client['verifyIdToken']>>['getPayload']
    >;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token de Google inválido');
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Token de Google inválido');
    }
    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
    };
  }
}
```

- [ ] **Step 3: DTO**

Crea `backend/src/auth/dto/google-login.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token de Google (JWT), sin verificar todavía' })
  @IsString({ message: 'idToken debe ser texto' })
  @Length(1, 4096, { message: 'idToken inválido' })
  idToken!: string;
}
```

- [ ] **Step 4: Escribir el e2e (debe fallar: la ruta no existe)**

Crea `backend/test/auth-google.e2e-spec.ts`:

```typescript
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
```

- [ ] **Step 5: Correr el e2e y verificar que falla**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- auth-google.e2e-spec.ts`
Expected: FAIL (la ruta no existe; `GoogleAuthService` tampoco).

- [ ] **Step 6: `AuthModule` registra `GoogleAuthService`**

En `backend/src/auth/auth.module.ts`, agrega el import:

```typescript
import { GoogleAuthService } from './google-auth.service';
```

Y agrégalo a `providers` (junto a `AuthService`):

```typescript
  providers: [AuthService, RefreshTokensService, JwtStrategy, GoogleAuthService],
```

- [ ] **Step 7: `AuthService.loginWithGoogle`**

En `backend/src/auth/auth.service.ts`, agrega los imports:

```typescript
import { GoogleAuthService } from './google-auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
```

Agrega `googleAuth` al constructor (último parámetro):

```typescript
  constructor(
    private readonly ds: DataSource,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly googleAuth: GoogleAuthService,
  ) {}
```

Agrega el método nuevo, después de `register(...)`:

```typescript
  /**
   * RF-AUT-10/D53/D54: find-or-create por correo con el perfil ya verificado por Google.
   * Vincula por correo si la cuenta ya existe sin `googleId` (D75); nunca cambia el `role`
   * de una cuenta existente.
   */
  async loginWithGoogle(dto: GoogleLoginDto): Promise<AuthResponseDto> {
    const profile = await this.googleAuth.verifyIdToken(dto.idToken);
    if (!profile.emailVerified) {
      throw new UnauthorizedException(
        'El correo de Google no está verificado',
      );
    }
    const email = UsersService.normalizeEmail(profile.email);

    return this.ds.transaction(async (m) => {
      let user = await m.findOne(User, {
        where: { googleId: profile.googleId },
      });
      if (!user) {
        user = await m.findOne(User, { where: { email } });
        if (user) {
          await m.update(User, { id: user.id }, {
            googleId: profile.googleId,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          });
          user = await m.findOneByOrFail(User, { id: user.id });
          await this.audit.log(m, {
            actorId: user.id,
            action: 'user.google_linked',
            entity: 'user',
            entityId: user.id,
          });
        } else {
          user = await m.save(
            User,
            m.create(User, {
              email,
              googleId: profile.googleId,
              name: profile.name,
              role: Role.CUSTOMER,
              emailVerifiedAt: new Date(),
            }),
          );
        }
      }
      return this.buildAuthResponse(m, user);
    });
  }
```

(`UnauthorizedException`, `Role`, `User` ya están importados en este archivo.)

- [ ] **Step 8: Ruta en `AuthController`**

En `backend/src/auth/auth.controller.ts`, agrega el import:

```typescript
import { GoogleLoginDto } from './dto/google-login.dto';
```

Agrega el método, después de `login(...)`:

```typescript
  @Public()
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @HttpCode(200)
  @Post('google')
  loginWithGoogle(@Body() dto: GoogleLoginDto): Promise<AuthResponseDto> {
    return this.auth.loginWithGoogle(dto);
  }
```

- [ ] **Step 9: Correr el e2e nuevo y verificar que pasa**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- auth-google.e2e-spec.ts`
Expected: PASS (5 pruebas).

- [ ] **Step 10: Regresión completa**

Run: `npm run typecheck && npm test && TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e`
Expected: todo en verde (baseline 140/140 e2e + 5 nuevas = 145/145).

- [ ] **Step 11: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example backend/src/core/config/env.validation.ts backend/src/auth backend/test/auth-google.e2e-spec.ts
git commit -m "Backend: POST /auth/google con verificación real del ID token (RF-AUT-10/D53/D54/D75)"
```

---

### Task 2: Documentación

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md`
- Modify: `docs/04-arquitectura.md`
- Modify: `docs/06-api.md`
- Modify: `docs/08-plan-de-sprints.md`
- Modify: `docs/09-decisiones-y-preguntas-abiertas.md`

**Interfaces:** (ninguna — solo texto)

- [ ] **Step 1: Registrar D75**

En `docs/09-decisiones-y-preguntas-abiertas.md`, agrega una sección nueva después de la sección D74 (verificación de correo, Sprint 2):

```markdown
### Decisión de login con Google — Sprint 2 (2026-10-21)
| Id | Decisión | Razón |
|---|---|---|
| D75 | `POST /auth/google`: si el correo ya existe **sin** `googleId` (cuenta registrada con contraseña), se **vincula** la cuenta de Google a esa cuenta existente en vez de rechazar o duplicar; se audita `user.google_linked`. | D53/D54 no cubren este caso; vincular es seguro (ambos medios ya probaron que esa persona controla el correo) y evita frustrar a un cliente que ya tenía cuenta. |
```

- [ ] **Step 2: Actualizar RF-AUT-10**

En `docs/02-requerimientos-funcionales.md`, reemplaza:

```markdown
| RF-AUT-10 | Login con **Google** vía NextAuth; primer ingreso crea el `user` (find-or-create por correo) con `role=CUSTOMER` (D53). | M | ⬜ |
```

por:

```markdown
| RF-AUT-10 | Login con **Google** vía NextAuth; primer ingreso crea el `user` (find-or-create por correo) con `role=CUSTOMER` (D53). | M | 🟡 (`POST /auth/google` ✅, D75; falta el provider de Google en NextAuth, Sprint 2 frontend) |
```

- [ ] **Step 3: Arquitectura**

En `docs/04-arquitectura.md`, en la fila de "Sesión web" (la que ya menciona `POST /auth/google`), actualiza la nota de estado si esa tabla distingue implementado/pendiente; si no distingue estado por fila, no la toques — revisa el archivo real antes de decidir.

- [ ] **Step 4: Fila de la API**

En `docs/06-api.md`, reemplaza:

```markdown
| ⬜ | `POST /auth/google` | 🌐 | Body `{idToken}` (token de Google verificado por NextAuth) → find-or-create por correo, `emailVerifiedAt` automático, `role=CUSTOMER` si es nuevo → `{accessToken, user}` (D53, D54, RF-AUT-10). |
```

por:

```markdown
| ✅ | `POST /auth/google` | 🌐 | Body `{idToken}`, **verificado por el backend** (no se confía en que el frontend ya lo validó). Find-or-create por correo: nuevo → `role=CUSTOMER`, `emailVerifiedAt` automático; existente sin `googleId` → se vincula (D75, auditado). 401 si el token no es válido o Google no certifica el correo como verificado. Devuelve el mismo shape que `login`/`register` (`{accessToken, refreshToken, user}`). |
```

- [ ] **Step 5: Checkbox del plan de sprints**

En `docs/08-plan-de-sprints.md`, reemplaza:

```markdown
- [ ] `POST /auth/google`: find-or-create por correo, `emailVerifiedAt` automático (D53, D54, RF-AUT-10).
```

por:

```markdown
- [x] `POST /auth/google`: find-or-create por correo, `emailVerifiedAt` automático (D53, D54, D75, RF-AUT-10).
```

- [ ] **Step 6: Commit**

```bash
git add docs/02-requerimientos-funcionales.md docs/04-arquitectura.md docs/06-api.md docs/08-plan-de-sprints.md docs/09-decisiones-y-preguntas-abiertas.md
git commit -m "Docs: POST /auth/google implementado — RF-AUT-10, D53/D54/D75"
```
