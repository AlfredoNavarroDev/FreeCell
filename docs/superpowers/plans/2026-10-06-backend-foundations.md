# Backend Fundaciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir el backend de Free Cell (Sprint 1) sobre el scaffold vacío de NestJS: esquema completo con lógica en
PostgreSQL, auth propia con refresh rotativo, reserva de carrito con `SKIP LOCKED`, colas BullMQ idempotentes,
observabilidad, Docker multi-stage y documentación.

**Architecture:** Módulos de dominio NestJS con TypeORM usado directamente en los servicios (sin capa de repositorios
propia). Las reglas críticas se duplican en PostgreSQL (CHECK, índices parciales, triggers, funciones) como defensa en
profundidad. Una imagen Docker, dos procesos: `dist/main.js` (HTTP) y `dist/worker.js` (processors BullMQ).

**Tech Stack:** Node 22 (imagen) / Node 26 (local), NestJS 11, TypeORM 0.3, PostgreSQL 16, Redis 7, BullMQ 6, Jest 30,
Supertest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-05-backend-foundations-design.md` (leerla antes de empezar; este plan la implementa).

## Global Constraints

- Directorio de trabajo de todos los comandos: `backend/` salvo que se indique otro. Rama: `feat/backend-foundations`.
- Versiones exactas (`--save-exact`). **Nunca** subir `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/bullmq`, `@nestjs/typeorm` a v12 ni `typeorm` a 1.x (son ESM y rompen Jest/CommonJS).
- `tsconfig.json` usa `module: nodenext` + `isolatedModules` + `emitDecoratorMetadata`: los **tipos que solo son interfaces** usados en firmas de constructores o parámetros decorados se importan con `import type` (si no, error TS1272). No usar `const enum`.
- Código, entidades, rutas y nombres en **inglés**; mensajes al usuario, comentarios de negocio y documentación en **español (es-PE)**.
- Dinero siempre en céntimos enteros (`int`). Monedas permitidas: exactamente `PEN` y `USD`.
- Las claves de licencia nunca aparecen en logs, errores, respuestas ni auditoría.
- Cambios de esquema solo por migración. Las pruebas e2e corren migraciones, **no** `synchronize`.
- No inventar datos de negocio: nombres, precios y datos de cobro del seed son placeholders `[..]` o valores marcados como placeholder.
- Commits: mensaje en español, **sin** línea `Co-Authored-By`, sin `--no-verify`, sin `--amend`. **No hacer push.**
- Prettier del scaffold: comillas simples, `trailingComma: all`.
- Definición de terminado de cada tarea: sus pruebas en verde y `npm run typecheck` sin errores.
- Si una API de librería no coincide con lo escrito aquí (por ejemplo, exports de `ioredis@6` o de `bullmq@6`), adaptar al mínimo, dejar un comentario de una línea con el motivo y anotarlo en el informe de la tarea.

## Mapa de archivos

```
backend/
  .env.example                      Variables de entorno con placeholders
  .dockerignore  Dockerfile  fly.toml  docker-compose.yml
  docker/init-test-db.sql           Crea licencias_test
  src/
    main.ts                         Bootstrap HTTP + Swagger
    worker.ts                       Bootstrap de processors (sin HTTP)
    app.module.ts                   Módulos HTTP + guards globales (+ WorkersModule si APP_ROLE=all)
    worker.module.ts                Módulos de processors
    workers.module.ts               Agrupa OrdersWorkerModule + NotificationsWorkerModule
    configure-app.ts                helmet, CORS, pipes, filtro, body limit (compartido main/tests)
    swagger.ts                      Documento OpenAPI en /docs
    core/
      config/env.validation.ts      EnvironmentVariables + validateEnv
      config/env.validation.spec.ts
      redis/redis.module.ts         REDIS_CLIENT (ioredis) + parseRedisUrl
      core.module.ts                Config, TypeORM, Redis, BullMQ root, pino
    common/
      crypto/crypto.service.ts (+ .spec.ts)  AES-256-GCM + HMAC
      crypto/crypto.module.ts
      decorators/public.decorator.ts  roles.decorator.ts  current-user.decorator.ts
      filters/all-exceptions.filter.ts (+ .spec.ts)
      types/authenticated-user.ts
    audit/sanitize-meta.ts (+ .spec.ts)  audit.service.ts  audit.module.ts
    database/
      enums.ts  currency.ts
      entities/*.entity.ts  entities/index.ts
      views/plan-stock.view.ts  views/sales-line.view.ts
      data-source-options.ts  data-source.ts  run-migrations.ts  seed.ts
      migrations/<ts>-InitialSchema.ts  migrations/<ts>-DatabaseLogic.ts
    health/health.controller.ts  redis.health.ts  health.module.ts
    users/users.service.ts  users.module.ts
    auth/
      refresh-policy.ts (+ .spec.ts)  refresh-tokens.service.ts  auth.service.ts  auth.controller.ts
      jwt.strategy.ts  guards/jwt-auth.guard.ts  guards/roles.guard.ts  dto/*.ts  auth.module.ts
    settings/settings.service.ts  settings.module.ts
    notifications/
      notification.types.ts  channels/notification-channel.ts  channels/log.channel.ts
      notifications.service.ts  notification-sender.service.ts  notifications.processor.ts
      notifications.module.ts  notifications-delivery.module.ts  notifications-worker.module.ts
    orders/
      orders.constants.ts  dto/create-order.dto.ts  dto/order-response.dto.ts
      orders-queue.service.ts  orders.service.ts  order-release.service.ts  orders.controller.ts
      orders.processor.ts  orders.module.ts  orders-worker.module.ts
  test/
    jest-e2e.json  setup-env.ts  global-setup.ts
    utils/test-app.ts  utils/factories.ts
    schema.e2e-spec.ts  db-logic.e2e-spec.ts  health.e2e-spec.ts  auth.e2e-spec.ts
    notifications.e2e-spec.ts  orders.e2e-spec.ts  concurrency.e2e-spec.ts  release.e2e-spec.ts  seed.e2e-spec.ts
```

---

### Task 1: Dependencias, configuración validada e infraestructura local

**Files:**
- Modify: `backend/package.json` (dependencias y scripts)
- Create: `backend/src/core/config/env.validation.ts`
- Test: `backend/src/core/config/env.validation.spec.ts`
- Create: `backend/.env.example`, `backend/docker-compose.yml`, `backend/docker/init-test-db.sql`
- Delete: `backend/src/app.controller.ts`, `backend/src/app.controller.spec.ts`, `backend/src/app.service.ts`, `backend/test/app.e2e-spec.ts`

**Interfaces:**
- Produces: `class EnvironmentVariables` con las propiedades `NODE_ENV`, `APP_ROLE`, `PORT`, `DATABASE_URL`, `DB_SSL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_PEPPER`, `LICENSE_ENC_KEY`, `CORS_ORIGIN`, `THROTTLE_ENABLED`, `LOG_LEVEL`, `ADMIN_EMAIL?`, `ADMIN_PASSWORD?`; `validateEnv(config: Record<string, unknown>): EnvironmentVariables` (lanza `Error` con el detalle si algo es inválido).

- [ ] **Step 1: Instalar dependencias**

```bash
cd backend
npm install --save-exact @nestjs/config@4.0.4 @nestjs/jwt@11.0.2 @nestjs/passport@11.0.5 @nestjs/bullmq@11.0.5 @nestjs/typeorm@11.0.3 @nestjs/swagger@11.4.7 @nestjs/terminus@11.1.1 @nestjs/throttler@6.7.1 @nest-lab/throttler-storage-redis@1.2.0 nestjs-pino@5.3.1 pino-http@11.0.0 pino@10.4.0 typeorm@0.3.31 pg@8.23.1 bullmq@6.3.11 ioredis@6.0.0 bcryptjs@3.0.3 passport@0.7.0 passport-jwt@4.0.1 class-validator@0.15.1 class-transformer@0.5.1 helmet@8.3.0 dotenv@17
npm install --save-exact --save-dev pino-pretty@13.2.0 @types/passport-jwt@4.0.1 @types/pg@8.23.1
```

Si `dotenv@17` no existe, usar la última versión publicada (`npm view dotenv version`).

- [ ] **Step 2: Agregar scripts a `backend/package.json`**

Dentro de `"scripts"`, conservar los del scaffold y agregar o reemplazar estos:

```json
"start:worker": "nest start --watch --entryFile worker",
"start:prod": "node dist/main",
"typecheck": "tsc --noEmit -p tsconfig.json",
"typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d src/database/data-source.ts",
"migration:generate": "npm run typeorm -- migration:generate",
"migration:run": "npm run typeorm -- migration:run",
"migration:revert": "npm run typeorm -- migration:revert",
"migration:create": "ts-node ./node_modules/typeorm/cli.js migration:create",
"seed": "ts-node -r tsconfig-paths/register src/database/seed.ts",
"test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
```

- [ ] **Step 3: Borrar el código de ejemplo del scaffold**

```bash
rm src/app.controller.ts src/app.controller.spec.ts src/app.service.ts test/app.e2e-spec.ts
```

Reemplazar `src/app.module.ts` por un módulo vacío temporal (se completa en la Tarea 5):

```ts
import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
```

- [ ] **Step 4: Escribir la prueba que falla** — `src/core/config/env.validation.spec.ts`

```ts
import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379/0',
  JWT_SECRET: 'x'.repeat(32),
  JWT_REFRESH_PEPPER: 'y'.repeat(32),
  LICENSE_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('validateEnv', () => {
  it('acepta una configuración mínima y aplica valores por defecto', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_ROLE).toBe('all');
    expect(env.PORT).toBe(3000);
    expect(env.DB_SSL).toBe(false);
    expect(env.THROTTLE_ENABLED).toBe(true);
    expect(env.CORS_ORIGIN).toBe('http://localhost:3001');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('usa APP_ROLE=api por defecto en producción', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' }).APP_ROLE).toBe('api');
  });

  it('convierte tipos desde strings', () => {
    const env = validateEnv({ ...base, PORT: '8080', DB_SSL: 'true', THROTTLE_ENABLED: 'false' });
    expect(env.PORT).toBe(8080);
    expect(env.DB_SSL).toBe(true);
    expect(env.THROTTLE_ENABLED).toBe(false);
  });

  it('rechaza LICENSE_ENC_KEY que no mide 32 bytes', () => {
    expect(() =>
      validateEnv({ ...base, LICENSE_ENC_KEY: Buffer.alloc(16, 1).toString('base64') }),
    ).toThrow(/LICENSE_ENC_KEY/);
  });

  it('rechaza JWT_SECRET corto', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
  });

  it('rechaza si falta DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 5: Ejecutar la prueba y verificar que falla**

Run: `npx jest src/core/config/env.validation.spec.ts`
Expected: FAIL con `Cannot find module './env.validation'`.

- [ ] **Step 6: Implementar** — `src/core/config/env.validation.ts`

```ts
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const toBool =
  (fallback: boolean) =>
  ({ value }: { value: unknown }): boolean =>
    value === undefined || value === '' ? fallback : value === true || value === 'true';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  /** `all` corre los processors dentro de la API (solo desarrollo). En producción, por defecto `api`. */
  @IsIn(['api', 'worker', 'all'])
  APP_ROLE!: 'api' | 'worker' | 'all';

  @Transform(({ value }) => (value === undefined || value === '' ? 3000 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @Transform(toBool(false))
  @IsBoolean()
  DB_SSL = false;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_PEPPER!: string;

  /** 32 bytes en base64. Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" */
  @IsString()
  LICENSE_ENC_KEY!: string;

  /** Orígenes permitidos separados por comas. */
  @IsString()
  CORS_ORIGIN = 'http://localhost:3001';

  @Transform(toBool(true))
  @IsBoolean()
  THROTTLE_ENABLED = true;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL = 'info';

  @IsOptional()
  @IsEmail()
  ADMIN_EMAIL?: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  ADMIN_PASSWORD?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { exposeDefaultValues: true });
  if (env.APP_ROLE === undefined) {
    env.APP_ROLE = env.NODE_ENV === 'production' ? 'api' : 'all';
  }

  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`);

  if (typeof env.LICENSE_ENC_KEY === 'string' && Buffer.from(env.LICENSE_ENC_KEY, 'base64').length !== 32) {
    problems.push('LICENSE_ENC_KEY: debe ser base64 de exactamente 32 bytes');
  }

  if (problems.length > 0) {
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`);
  }
  return env;
}
```

- [ ] **Step 7: Ejecutar la prueba y verificar que pasa**

Run: `npx jest src/core/config/env.validation.spec.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 8: Infraestructura local** — crear `backend/docker/init-test-db.sql`:

```sql
CREATE DATABASE licencias_test;
```

Crear `backend/docker-compose.yml` (el perfil `app` se agrega en la Tarea 11):

```yaml
# Servicios de desarrollo: PostgreSQL 16 + Redis 7.
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: freecell
      POSTGRES_PASSWORD: freecell
      POSTGRES_DB: freecell
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
      # Crea la base "licencias_test" de las pruebas e2e (solo al crear el volumen).
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U freecell -d freecell']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

Crear `backend/.env.example`:

```bash
NODE_ENV=development
# api | worker | all (all = processors dentro de la API, solo desarrollo)
APP_ROLE=all
PORT=3000
DATABASE_URL=postgresql://freecell:freecell@localhost:5432/freecell
DB_SSL=false
REDIS_URL=redis://localhost:6379/0
# Mínimo 32 caracteres. Generar: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=[genera-un-secreto-de-al-menos-32-caracteres]
JWT_REFRESH_PEPPER=[genera-otro-secreto-de-al-menos-32-caracteres]
# 32 bytes en base64. Generar: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
LICENSE_ENC_KEY=[base64-de-32-bytes]
CORS_ORIGIN=http://localhost:3001
THROTTLE_ENABLED=true
LOG_LEVEL=info
# Solo para npm run seed
ADMIN_EMAIL=[correo-del-admin]
ADMIN_PASSWORD=[contraseña-de-al-menos-12-caracteres]
```

Copiar a `.env` y generar valores reales locales (el `.env` está en `.gitignore` de la raíz):

```bash
cp .env.example .env
node -e "const c=require('crypto');console.log('JWT_SECRET='+c.randomBytes(48).toString('base64url'));console.log('JWT_REFRESH_PEPPER='+c.randomBytes(48).toString('base64url'));console.log('LICENSE_ENC_KEY='+c.randomBytes(32).toString('base64'))"
```

Pegar esas tres líneas en `.env`, y poner `ADMIN_EMAIL=admin@freecell.local` y `ADMIN_PASSWORD=` con 12+ caracteres.

- [ ] **Step 9: Levantar servicios**

Run: `docker compose up -d && docker compose ps`
Expected: `postgres` y `redis` en estado `healthy`.
Run: `docker compose exec postgres psql -U freecell -d freecell -c "\l" | grep licencias_test`
Expected: aparece `licencias_test`. Si no aparece (volumen preexistente), ejecutar `docker compose exec postgres psql -U freecell -d freecell -c "CREATE DATABASE licencias_test"`.

- [ ] **Step 10: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add package.json package-lock.json src test .env.example docker-compose.yml docker
git commit -m "Backend: dependencias, validación de entorno y servicios locales

Instala el stack fijado (Nest 11, TypeORM 0.3, BullMQ 6), valida las
variables de entorno al arrancar y agrega Docker Compose con Postgres 16
y Redis 7 más la base licencias_test."
```

---

### Task 2: Entidades, migración `InitialSchema` e infraestructura e2e

**Files:**
- Create: `backend/src/database/enums.ts`, `backend/src/database/currency.ts`
- Create: `backend/src/database/entities/` (19 entidades + `index.ts`), `backend/src/database/views/plan-stock.view.ts`, `backend/src/database/views/sales-line.view.ts`
- Create: `backend/src/database/data-source-options.ts`, `backend/src/database/data-source.ts`
- Create: `backend/src/database/migrations/<timestamp>-InitialSchema.ts` (generada)
- Modify: `backend/test/jest-e2e.json`
- Create: `backend/test/setup-env.ts`, `backend/test/global-setup.ts`
- Test: `backend/test/schema.e2e-spec.ts`

**Interfaces:**
- Produces: enums `Role`, `PlanKind`, `LicenseStatus`, `OrderStatus`, `PaymentStatus`, `PaymentMethodKind`, `ClaimStatus`, `TicketStatus`, `ReviewStatus`, `RefreshRevokeReason`; `CURRENCIES = ['PEN','USD'] as const`, `type Currency`; entidades con los nombres de clase de la lista de abajo; `ENTITIES` (array con entidades y vistas); `buildDataSourceOptions(env: { DATABASE_URL: string; DB_SSL: boolean }): DataSourceOptions`.

- [ ] **Step 1: Enums y moneda**

`src/database/enums.ts`:

```ts
export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

export enum PlanKind {
  NEW = 'NEW',
  RENEWAL = 'RENEWAL',
}

export enum LicenseStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  VOID = 'VOID',
}

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  IN_REVIEW = 'IN_REVIEW',
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PaymentMethodKind {
  WALLET = 'WALLET',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CRYPTO = 'CRYPTO',
}

export enum ClaimStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum ReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  HIDDEN = 'HIDDEN',
}

export enum RefreshRevokeReason {
  ROTATED = 'ROTATED',
  LOGOUT = 'LOGOUT',
  REUSE_DETECTED = 'REUSE_DETECTED',
}
```

`src/database/currency.ts`:

```ts
/** Monedas permitidas (D61). Agregar una nueva exige migración: cambia los CHECK. */
export const CURRENCIES = ['PEN', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Expresión SQL para @Check sobre una columna de moneda. */
export const currencyCheck = (column: string): string => `"${column}" IN ('PEN', 'USD')`;

/** Columna de moneda: char(3). */
export const CURRENCY_COLUMN = { type: 'char', length: 3 } as const;
```

- [ ] **Step 2: Entidades de usuarios, catálogo y precios**

`src/database/entities/user.entity.ts`:

```ts
import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../enums';

@Entity('users')
@Check('CHK_users_credentials', `"passwordHash" IS NOT NULL OR "googleId" IS NOT NULL`)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Siempre en minúsculas y sin espacios (lo normaliza el servicio). */
  @Column({ type: 'varchar', length: 254, unique: true })
  email!: string;

  /** Vacío en cuentas solo-Google (D53). */
  @Column({ type: 'varchar', nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true, select: false })
  googleId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  name!: string | null;

  @Column({ type: 'enum', enum: Role, default: Role.CUSTOMER })
  role!: Role;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/refresh-token.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RefreshRevokeReason } from '../enums';
import { User } from './user.entity';

/** Refresh token opaco. Solo se guarda su HMAC, nunca el valor (D56). */
@Entity('refresh_tokens')
@Index(['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash!: string;

  /** Todos los tokens nacidos del mismo login comparten familia. */
  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'enum', enum: RefreshRevokeReason, nullable: true })
  revokedReason!: RefreshRevokeReason | null;

  @Column({ type: 'uuid', nullable: true })
  replacedById!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

`src/database/entities/category.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  name!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/product.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { Plan } from './plan.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 140, unique: true })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: Category | null;

  /** La licencia se aplica sobre la cuenta del cliente en la herramienta (D14). */
  @Column({ type: 'boolean', default: false })
  requiresToolUsername!: boolean;

  @OneToMany(() => Plan, (plan) => plan.product)
  plans?: Plan[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/plan.entity.ts`:

```ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanKind } from '../enums';
import { PlanPrice } from './plan-price.entity';
import { Product } from './product.entity';

/** Variante comprable. Los precios viven en plan_prices (D61). */
@Entity('plans')
@Check('CHK_plans_duration', `"durationDays" > 0`)
@Check('CHK_plans_low_stock', `"lowStockThreshold" >= 0`)
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.plans, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: PlanKind, default: PlanKind.NEW })
  kind!: PlanKind;

  @Column({ type: 'int' })
  durationDays!: number;

  @Column({ type: 'int', default: 5 })
  lowStockThreshold!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @OneToMany(() => PlanPrice, (price) => price.plan)
  prices?: PlanPrice[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/plan-price.entity.ts`:

```ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { CURRENCY_COLUMN, currencyCheck, type Currency } from '../currency';
import { Plan } from './plan.entity';

/** Precio de un plan en una moneda. Un plan puede tener PEN, USD o ambas (D61). */
@Entity('plan_prices')
@Unique('UQ_plan_prices_plan_currency', ['planId', 'currency'])
@Check('CHK_plan_prices_currency', currencyCheck('currency'))
@Check('CHK_plan_prices_positive', `"priceCents" > 0`)
export class PlanPrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, (plan) => plan.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column(CURRENCY_COLUMN)
  currency!: Currency;

  @Column({ type: 'int' })
  priceCents!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

- [ ] **Step 3: Entidades de inventario**

`src/database/entities/license-batch.entity.ts`:

```ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CURRENCY_COLUMN, currencyCheck, type Currency } from '../currency';
import { Plan } from './plan.entity';

/** Compra a un proveedor. El costo se guarda como se pagó, con la tasa real (D62). */
@Entity('license_batches')
@Check('CHK_license_batches_currency', currencyCheck('costCurrency'))
@Check('CHK_license_batches_cost', `"unitCostCents" >= 0`)
@Check(
  'CHK_license_batches_fx',
  `("costCurrency" = 'USD' AND "fxRatePen" IS NOT NULL AND "fxRatePen" > 0) OR ("costCurrency" = 'PEN' AND "fxRatePen" IS NULL)`,
)
export class LicenseBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'varchar', length: 120, nullable: true })
  supplier!: string | null;

  @Column({ type: 'int' })
  unitCostCents!: number;

  @Column({ ...CURRENCY_COLUMN, default: 'USD' })
  costCurrency!: Currency;

  /** Soles pagados por cada dólar/USDT de este lote. Postgres numeric llega como string. */
  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  fxRatePen!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  purchasedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/license-item.entity.ts`:

```ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LicenseStatus } from '../enums';
import { LicenseBatch } from './license-batch.entity';
import { OrderItem } from './order-item.entity';
import { Plan } from './plan.entity';

/** Una licencia vendible. La clave va cifrada y nunca se selecciona por defecto. */
@Entity('license_items')
@Index(['planId', 'status'])
@Index('UQ_license_items_active_order_item', ['orderItemId'], {
  unique: true,
  where: `"status" IN ('RESERVED', 'SOLD')`,
})
@Check(
  'CHK_license_items_state',
  `("status" = 'AVAILABLE' AND "orderItemId" IS NULL AND "reservedUntil" IS NULL) OR ("status" IN ('RESERVED', 'SOLD') AND "orderItemId" IS NOT NULL) OR "status" = 'VOID'`,
)
export class LicenseItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'uuid' })
  batchId!: string;

  @ManyToOne(() => LicenseBatch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batchId' })
  batch?: LicenseBatch;

  /** AES-256-GCM: base64(iv):base64(tag):base64(ct). */
  @Column({ type: 'text', select: false })
  secretEncrypted!: string;

  /** HMAC-SHA256 de la clave en claro (D58), para detectar duplicados. */
  @Column({ type: 'char', length: 64, unique: true, select: false })
  secretHash!: string;

  @Column({ type: 'enum', enum: LicenseStatus, default: LicenseStatus.AVAILABLE })
  status!: LicenseStatus;

  @Column({ type: 'timestamptz', nullable: true })
  reservedUntil!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  orderItemId!: string | null;

  @ManyToOne(() => OrderItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderItemId' })
  orderItem?: OrderItem | null;

  @Column({ type: 'timestamptz', nullable: true })
  soldAt!: Date | null;

  /** Licencia original a la que reemplaza tras un reclamo (D28). */
  @Column({ type: 'uuid', nullable: true })
  replacesId!: string | null;

  @ManyToOne(() => LicenseItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'replacesId' })
  replaces?: LicenseItem | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

- [ ] **Step 4: Entidades de pedidos y pagos**

`src/database/entities/order.entity.ts`:

```ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CURRENCY_COLUMN, currencyCheck, type Currency } from '../currency';
import { OrderStatus } from '../enums';
import { OrderItem } from './order-item.entity';
import { User } from './user.entity';

@Entity('orders')
@Index(['status', 'expiresAt'])
@Check('CHK_orders_currency', currencyCheck('currency'))
@Check('CHK_orders_total', `"totalCents" >= 0`)
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Número legible (#1001, #1002…). La secuencia arranca en 1001 (migración DatabaseLogic). */
  @Column({ type: 'int', unique: true })
  @Generated('increment')
  orderNumber!: number;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_PAYMENT })
  status!: OrderStatus;

  @Column({ type: 'int' })
  totalCents!: number;

  /** La elige el cliente; todas las líneas se cobran en esta moneda (D61). */
  @Column(CURRENCY_COLUMN)
  currency!: Currency;

  @Column({ type: 'varchar', length: 120, nullable: true })
  toolUsername!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', length: 40, nullable: true })
  cancelReason!: string | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: OrderItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/order-item.entity.ts`:

```ts
import { Check, Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Order } from './order.entity';
import { Plan } from './plan.entity';

/** Una unidad comprada. Precio congelado al crear el pedido; hereda la moneda del pedido. */
@Entity('order_items')
@Check('CHK_order_items_price', `"unitPriceCents" > 0`)
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column({ type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'planId' })
  plan?: Plan;

  @Column({ type: 'int' })
  unitPriceCents!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

`src/database/entities/payment-method.entity.ts`:

```ts
import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { type Currency } from '../currency';
import { PaymentMethodKind } from '../enums';

/** Método de pago administrable (D63). Los datos de cobro van en `instructions` (D65). */
@Entity('payment_methods')
@Check(
  'CHK_payment_methods_currencies',
  `cardinality("currencies") > 0 AND "currencies" <@ ARRAY['PEN', 'USD']::char(3)[]`,
)
@Check('CHK_payment_methods_crypto_usd', `"kind" <> 'CRYPTO' OR "currencies" = ARRAY['USD']::char(3)[]`)
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  @Column({ type: 'enum', enum: PaymentMethodKind })
  kind!: PaymentMethodKind;

  @Column({ type: 'char', length: 3, array: true })
  currencies!: Currency[];

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  instructions!: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/payment.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '../enums';
import { Order } from './order.entity';
import { PaymentMethod } from './payment-method.entity';
import { User } from './user.entity';

/** Comprobante y su revisión. La lógica llega en Sprint 2. */
@Entity('payments')
@Index(['status'])
@Unique('UQ_payments_method_operation', ['paymentMethodId', 'operationNumber'])
@Index('UQ_payments_one_pending_per_order', ['orderId'], { unique: true, where: `"status" = 'PENDING'` })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column({ type: 'uuid' })
  paymentMethodId!: string;

  @ManyToOne(() => PaymentMethod, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod?: PaymentMethod;

  /** Normalizado: sin espacios y en minúsculas (D64). */
  @Column({ type: 'varchar', length: 120 })
  operationNumber!: string;

  /** Llave del archivo en R2 (privado). */
  @Column({ type: 'varchar', length: 255 })
  proofKey!: string;

  @Column({ type: 'char', length: 64, unique: true })
  proofHash!: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

- [ ] **Step 5: Entidades de Sprint 2+ y transversales**

`src/database/entities/claim.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClaimStatus } from '../enums';
import { LicenseItem } from './license-item.entity';
import { Order } from './order.entity';
import { User } from './user.entity';

@Entity('claims')
@Index(['status'])
@Index('UQ_claims_one_open_per_order', ['orderId'], { unique: true, where: `"status" = 'OPEN'` })
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column({ type: 'uuid' })
  licenseItemId!: string;

  @ManyToOne(() => LicenseItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'licenseItemId' })
  licenseItem?: LicenseItem;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.OPEN })
  status!: ClaimStatus;

  @Column({ type: 'uuid', nullable: true })
  replacementLicenseId!: string | null;

  @ManyToOne(() => LicenseItem, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'replacementLicenseId' })
  replacementLicense?: LicenseItem | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/support-ticket.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TicketStatus } from '../enums';
import { User } from './user.entity';

@Entity('support_tickets')
@Index(['status'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 150 })
  subject!: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status!: TicketStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/ticket-message.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SupportTicket } from './support-ticket.entity';
import { User } from './user.entity';

@Entity('ticket_messages')
export class TicketMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  ticketId!: string;

  @ManyToOne(() => SupportTicket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket?: SupportTicket;

  @Column({ type: 'uuid' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorId' })
  author?: User;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'boolean', default: false })
  isAdmin!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

`src/database/entities/review.entity.ts`:

```ts
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ReviewStatus } from '../enums';
import { Order } from './order.entity';
import { Product } from './product.entity';
import { User } from './user.entity';

@Entity('reviews')
@Index(['status'])
@Unique('UQ_reviews_order_product', ['orderId', 'productId'])
@Check('CHK_reviews_rating', `"rating" BETWEEN 1 AND 5`)
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'enum', enum: ReviewStatus, default: ReviewStatus.PENDING })
  status!: ReviewStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/setting.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Configuración clave/valor (TTL de reserva, SLA, horario…). */
@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
```

`src/database/entities/audit-log.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Solo inserción: un trigger bloquea UPDATE y DELETE (D57). Sin FK a users a propósito. */
@Entity('audit_logs')
@Index(['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'varchar', length: 40 })
  entity!: string;

  @Column({ type: 'varchar', length: 64 })
  entityId!: string;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

`src/database/entities/notification-log.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Huella de cada mensaje enviado: evita duplicados cuando BullMQ reintenta. */
@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 20 })
  channel!: string;

  @Column({ type: 'varchar', length: 254 })
  recipient!: string;

  @Column({ type: 'varchar', length: 60 })
  template!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

- [ ] **Step 6: Vistas (solo mapeo; las crea la migración DatabaseLogic)**

`src/database/views/plan-stock.view.ts`:

```ts
import { ViewColumn, ViewEntity } from 'typeorm';

export type StockState = 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK';

/** La fuente de verdad es la migración DatabaseLogic; `synchronize: false` evita que TypeORM la regenere. */
@ViewEntity({ name: 'v_plan_stock', synchronize: false })
export class PlanStockView {
  @ViewColumn()
  planId!: string;

  @ViewColumn()
  available!: number;

  @ViewColumn()
  reserved!: number;

  @ViewColumn()
  sold!: number;

  @ViewColumn()
  void!: number;

  @ViewColumn()
  stockState!: StockState;
}
```

`src/database/views/sales-line.view.ts`:

```ts
import { ViewColumn, ViewEntity } from 'typeorm';
import { type Currency } from '../currency';

/** Una fila por licencia vendida, con margen en la moneda de la venta (D62). */
@ViewEntity({ name: 'v_sales_lines', synchronize: false })
export class SalesLineView {
  @ViewColumn()
  orderId!: string;

  @ViewColumn()
  orderItemId!: string;

  @ViewColumn()
  planId!: string;

  @ViewColumn()
  productId!: string;

  @ViewColumn()
  currency!: Currency;

  @ViewColumn()
  unitPriceCents!: number;

  @ViewColumn()
  costCurrency!: Currency;

  @ViewColumn()
  unitCostCents!: number;

  @ViewColumn()
  fxRatePen!: string | null;

  @ViewColumn()
  marginCents!: number | null;

  @ViewColumn()
  soldAt!: Date | null;
}
```

`src/database/entities/index.ts`:

```ts
import { PlanStockView } from '../views/plan-stock.view';
import { SalesLineView } from '../views/sales-line.view';
import { AuditLog } from './audit-log.entity';
import { Category } from './category.entity';
import { Claim } from './claim.entity';
import { LicenseBatch } from './license-batch.entity';
import { LicenseItem } from './license-item.entity';
import { NotificationLog } from './notification-log.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { PaymentMethod } from './payment-method.entity';
import { Payment } from './payment.entity';
import { PlanPrice } from './plan-price.entity';
import { Plan } from './plan.entity';
import { Product } from './product.entity';
import { RefreshToken } from './refresh-token.entity';
import { Review } from './review.entity';
import { Setting } from './setting.entity';
import { SupportTicket } from './support-ticket.entity';
import { TicketMessage } from './ticket-message.entity';
import { User } from './user.entity';

export {
  AuditLog,
  Category,
  Claim,
  LicenseBatch,
  LicenseItem,
  NotificationLog,
  Order,
  OrderItem,
  Payment,
  PaymentMethod,
  Plan,
  PlanPrice,
  PlanStockView,
  Product,
  RefreshToken,
  Review,
  SalesLineView,
  Setting,
  SupportTicket,
  TicketMessage,
  User,
};

export const ENTITIES = [
  AuditLog,
  Category,
  Claim,
  LicenseBatch,
  LicenseItem,
  NotificationLog,
  Order,
  OrderItem,
  Payment,
  PaymentMethod,
  Plan,
  PlanPrice,
  Product,
  RefreshToken,
  Review,
  Setting,
  SupportTicket,
  TicketMessage,
  User,
  PlanStockView,
  SalesLineView,
];
```

- [ ] **Step 7: DataSource compartido (app y CLI)**

`src/database/data-source-options.ts`:

```ts
import { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';

// Al correr compilado (dist) se cargan los .js; con ts-node, los .ts. Evita cargar los .d.ts de dist.
const MIGRATIONS_EXT = __filename.endsWith('.ts') ? 'ts' : 'js';

/** Misma configuración para la app, el CLI de migraciones, el seed y las pruebas. */
export function buildDataSourceOptions(env: { DATABASE_URL: string; DB_SSL: boolean }): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    // Neon exige SSL.
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: [`${__dirname}/migrations/*.${MIGRATIONS_EXT}`],
    migrationsTransactionMode: 'each',
    // gen_random_uuid() viene en Postgres 13+, sin extensión uuid-ossp.
    uuidExtension: 'pgcrypto',
    synchronize: false,
  };
}
```

`src/database/data-source.ts`:

```ts
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

// Usado por el CLI: npm run migration:generate | migration:run | migration:revert
export default new DataSource(
  buildDataSourceOptions({
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    DB_SSL: process.env.DB_SSL === 'true',
  }),
);
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: sin errores. Si aparece TS1272 en algún archivo, cambiar el `import` del tipo a `import type` / `type X` dentro de las llaves.

- [ ] **Step 9: Generar la migración inicial**

Run (con `docker compose up -d` y la base `freecell` vacía):

```bash
npm run migration:generate -- src/database/migrations/InitialSchema
```

Expected: crea `src/database/migrations/<timestamp>-InitialSchema.ts`.

Revisar el archivo generado y confirmar que contiene (buscar con `grep`):

```bash
grep -c "CREATE TABLE" src/database/migrations/*-InitialSchema.ts   # 19
grep -n "CHK_users_credentials\|CHK_license_items_state\|CHK_license_batches_fx\|CHK_payment_methods_crypto_usd" src/database/migrations/*-InitialSchema.ts
grep -n "UQ_license_items_active_order_item\|UQ_payments_one_pending_per_order\|UQ_claims_one_open_per_order" src/database/migrations/*-InitialSchema.ts
grep -n '"orderNumber" SERIAL' src/database/migrations/*-InitialSchema.ts
grep -n "gen_random_uuid" src/database/migrations/*-InitialSchema.ts | head -1
grep -n "v_plan_stock\|v_sales_lines" src/database/migrations/*-InitialSchema.ts   # sin resultados
```

Los índices parciales deben llevar `WHERE`. Si `orderNumber` no sale como `SERIAL`, revisar `@Generated('increment')`. Si aparecen vistas, falta `synchronize: false` en `@ViewEntity`. No editar el SQL a mano: corregir la entidad, borrar el archivo y volver a generar.

- [ ] **Step 10: Aplicar la migración en la base de desarrollo**

Run: `npm run migration:run`
Expected: `Migration InitialSchema<timestamp> has been executed successfully.`

- [ ] **Step 11: Infraestructura de pruebas e2e**

Reemplazar `test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "setupFiles": ["<rootDir>/setup-env.ts"],
  "globalSetup": "<rootDir>/global-setup.ts",
  "testTimeout": 30000
}
```

`test/setup-env.ts`:

```ts
// Las pruebas usan una base y un Redis aparte: nunca tocan los datos de desarrollo.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://freecell:freecell@localhost:5432/licencias_test';

process.env.NODE_ENV = 'test';
process.env.APP_ROLE = 'api';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DB_SSL = 'false';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_PEPPER = 'test-refresh-pepper-0123456789abcdef0123';
process.env.LICENSE_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.CORS_ORIGIN = 'http://localhost:3001';
process.env.THROTTLE_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
```

`test/global-setup.ts`:

```ts
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';

/** Deja licencias_test vacía y con todas las migraciones aplicadas (tablas, triggers, vistas, funciones). */
export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://freecell:freecell@localhost:5432/licencias_test';
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();

  execSync('npm run migration:run', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url, DB_SSL: 'false' },
    stdio: 'inherit',
  });
}
```

- [ ] **Step 12: Escribir la prueba de esquema** — `test/schema.e2e-spec.ts`

```ts
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { TEST_DATABASE_URL } from './setup-env';

describe('Esquema inicial', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await new DataSource(buildDataSourceOptions({ DATABASE_URL: TEST_DATABASE_URL, DB_SSL: false })).initialize();
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('crea las 19 tablas', async () => {
    const rows: { tablename: string }[] = await ds.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations' ORDER BY tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      'audit_logs',
      'categories',
      'claims',
      'license_batches',
      'license_items',
      'notification_logs',
      'order_items',
      'orders',
      'payment_methods',
      'payments',
      'plan_prices',
      'plans',
      'products',
      'refresh_tokens',
      'reviews',
      'settings',
      'support_tickets',
      'ticket_messages',
      'users',
    ]);
  });

  it('declara los índices parciales que sostienen las reglas de negocio', async () => {
    const rows: { indexname: string; indexdef: string }[] = await ds.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'UQ_%'`,
    );
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.get('UQ_license_items_active_order_item')).toMatch(/WHERE/);
    expect(byName.get('UQ_payments_one_pending_per_order')).toMatch(/WHERE/);
    expect(byName.get('UQ_claims_one_open_per_order')).toMatch(/WHERE/);
  });

  it('rechaza un usuario sin contraseña ni googleId', async () => {
    await expect(ds.query(`INSERT INTO users (email) VALUES ('sin-credenciales@test.pe')`)).rejects.toThrow(
      /CHK_users_credentials/,
    );
  });
});
```

- [ ] **Step 13: Ejecutar las pruebas e2e**

Run: `npm run test:e2e -- schema`
Expected: PASS (3 pruebas). Si `global-setup` falla al conectar, revisar que `licencias_test` exista (Tarea 1, Step 9).

- [ ] **Step 14: Commit**

```bash
git add src/database test
git commit -m "Backend: entidades y migración inicial con el esquema completo

19 tablas (incluye refresh_tokens, plan_prices y payment_methods),
CHECK de invariantes, índices únicos parciales y monedas PEN/USD.
Las pruebas e2e reconstruyen licencias_test corriendo migraciones."
```

---

### Task 3: Migración `DatabaseLogic` — triggers, vistas y funciones

**Files:**
- Create: `backend/src/database/migrations/<timestamp>-DatabaseLogic.ts`
- Create: `backend/test/utils/factories.ts`
- Test: `backend/test/db-logic.e2e-spec.ts`

**Interfaces:**
- Consumes: entidades de la Tarea 2.
- Produces (SQL): `fn_release_order(p_order_id uuid, p_reason text, p_require_expired boolean) RETURNS boolean`, `fn_release_expired() RETURNS SETOF uuid`, vistas `v_plan_stock` y `v_sales_lines`, triggers `trg_set_updated_at`, `trg_license_status_guard`, `trg_order_status_guard`, `trg_order_total_check`, `trg_order_items_total_check`, `trg_audit_logs_immutable`, `trg_payment_method_currency`. Errores de trigger con `ERRCODE = 'P0001'`.
- Produces (TS, `test/utils/factories.ts`): `TEST_PASSWORD`, `createUser(ds, overrides?)`, `createCatalog(ds, options?)`, `createPaymentMethod(ds, overrides?)`, `insertOrder(ds, input)` (firmas en el Step 2).

- [ ] **Step 1: Crear el archivo de migración**

```bash
npm run migration:create -- src/database/migrations/DatabaseLogic
```

Expected: crea `src/database/migrations/<timestamp>-DatabaseLogic.ts` con una clase `DatabaseLogic<timestamp>`. Conservar ese nombre de clase y reemplazar el cuerpo completo por el de abajo (cambiando solo `<timestamp>` por el que generó el CLI):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tablas con columna "updatedAt" que mantiene el trigger trg_set_updated_at. */
const UPDATED_AT_TABLES = [
  'users',
  'categories',
  'products',
  'plans',
  'plan_prices',
  'license_batches',
  'license_items',
  'orders',
  'payment_methods',
  'payments',
  'claims',
  'support_tickets',
  'reviews',
  'settings',
];

/**
 * Lógica en base de datos como defensa en profundidad (D57): aunque un servicio tenga un bug,
 * Postgres no deja revender una licencia, saltar estados ni editar la auditoría.
 */
export class DatabaseLogic<timestamp> implements MigrationInterface {
  name = 'DatabaseLogic<timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Números de pedido legibles desde #1001 (también tras TRUNCATE ... RESTART IDENTITY).
    await queryRunner.query(`
      DO $$ BEGIN
        EXECUTE format('ALTER SEQUENCE %s START WITH 1001 RESTART WITH 1001',
                       pg_get_serial_sequence('orders', 'orderNumber'));
      END $$;
    `);

    // 1. updatedAt también para SQL directo (seed, funciones, scripts).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW."updatedAt" := now();
        RETURN NEW;
      END $$;
    `);
    for (const table of UPDATED_AT_TABLES) {
      await queryRunner.query(
        `CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()`,
      );
    }

    // 2. Transiciones válidas de licencia (regla 1).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_license_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = OLD.status THEN
          RETURN NEW;
        END IF;
        IF (OLD.status::text || '->' || NEW.status::text) IN (
          'AVAILABLE->RESERVED', 'RESERVED->AVAILABLE', 'RESERVED->SOLD', 'SOLD->VOID', 'AVAILABLE->VOID'
        ) THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Transición de licencia no permitida: % -> %', OLD.status, NEW.status
          USING ERRCODE = 'P0001';
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_license_status_guard BEFORE UPDATE OF status ON license_items
      FOR EACH ROW EXECUTE FUNCTION fn_license_status_guard()
    `);

    // 3. Máquina de estados del pedido (docs/04).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_order_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = OLD.status THEN
          RETURN NEW;
        END IF;
        IF (OLD.status::text || '->' || NEW.status::text) IN (
          'PENDING_PAYMENT->IN_REVIEW', 'PENDING_PAYMENT->CANCELLED',
          'IN_REVIEW->DELIVERED', 'IN_REVIEW->PENDING_ACTIVATION', 'IN_REVIEW->PENDING_PAYMENT', 'IN_REVIEW->CANCELLED',
          'PENDING_ACTIVATION->DELIVERED'
        ) THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Transición de pedido no permitida: % -> %', OLD.status, NEW.status
          USING ERRCODE = 'P0001';
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_order_status_guard BEFORE UPDATE OF status ON orders
      FOR EACH ROW EXECUTE FUNCTION fn_order_status_guard()
    `);

    // 4. totalCents = suma de líneas, verificado al hacer COMMIT (invariante 5).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_order_total_check() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        v_order uuid;
        v_total int;
        v_sum bigint;
      BEGIN
        IF TG_TABLE_NAME = 'orders' THEN
          v_order := NEW.id;
        ELSIF TG_OP = 'DELETE' THEN
          v_order := OLD."orderId";
        ELSE
          v_order := NEW."orderId";
        END IF;

        SELECT "totalCents" INTO v_total FROM orders WHERE id = v_order;
        IF NOT FOUND THEN
          RETURN NULL;
        END IF;

        SELECT COALESCE(SUM("unitPriceCents"), 0) INTO v_sum FROM order_items WHERE "orderId" = v_order;
        IF v_sum <> v_total THEN
          RAISE EXCEPTION 'El total del pedido % no coincide con sus líneas', v_order USING ERRCODE = 'P0001';
        END IF;
        RETURN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_order_total_check
      AFTER INSERT OR UPDATE OF "totalCents" ON orders
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_total_check()
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER trg_order_items_total_check
      AFTER INSERT OR UPDATE OR DELETE ON order_items
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fn_order_total_check()
    `);

    // 5. audit_logs es de solo inserción.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs es de solo inserción' USING ERRCODE = 'P0001';
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION fn_audit_logs_immutable()
    `);

    // 6. El método de pago debe estar activo y aceptar la moneda del pedido (D63).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_payment_method_currency() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        v_currency char(3);
        v_ok boolean;
      BEGIN
        SELECT o.currency INTO v_currency FROM orders o WHERE o.id = NEW."orderId";
        SELECT (pm.active AND v_currency = ANY (pm.currencies)) INTO v_ok
          FROM payment_methods pm WHERE pm.id = NEW."paymentMethodId";
        IF v_ok IS NOT TRUE THEN
          RAISE EXCEPTION 'Método de pago no válido para la moneda %', v_currency USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_payment_method_currency BEFORE INSERT OR UPDATE OF "paymentMethodId" ON payments
      FOR EACH ROW EXECUTE FUNCTION fn_payment_method_currency()
    `);

    // Vistas de solo lectura. Ninguna expone secretEncrypted ni secretHash.
    await queryRunner.query(`
      CREATE VIEW v_plan_stock AS
      SELECT
        p.id AS "planId",
        (COUNT(li.id) FILTER (WHERE li.status = 'AVAILABLE'))::int AS available,
        (COUNT(li.id) FILTER (WHERE li.status = 'RESERVED'))::int AS reserved,
        (COUNT(li.id) FILTER (WHERE li.status = 'SOLD'))::int AS sold,
        (COUNT(li.id) FILTER (WHERE li.status = 'VOID'))::int AS "void",
        CASE
          WHEN COUNT(li.id) FILTER (WHERE li.status = 'AVAILABLE') = 0 THEN 'OUT_OF_STOCK'
          WHEN COUNT(li.id) FILTER (WHERE li.status = 'AVAILABLE') <= p."lowStockThreshold" THEN 'LOW'
          ELSE 'IN_STOCK'
        END AS "stockState"
      FROM plans p
      LEFT JOIN license_items li ON li."planId" = p.id
      GROUP BY p.id
    `);
    await queryRunner.query(`
      CREATE VIEW v_sales_lines AS
      SELECT
        o.id AS "orderId",
        oi.id AS "orderItemId",
        oi."planId",
        pl."productId",
        o.currency,
        oi."unitPriceCents",
        b."costCurrency",
        b."unitCostCents",
        b."fxRatePen",
        CASE
          WHEN o.currency = b."costCurrency" THEN oi."unitPriceCents" - b."unitCostCents"
          WHEN o.currency = 'PEN' AND b."costCurrency" = 'USD'
            THEN oi."unitPriceCents" - ROUND(b."unitCostCents" * b."fxRatePen")::int
          ELSE NULL
        END AS "marginCents",
        li."soldAt"
      FROM license_items li
      JOIN order_items oi ON oi.id = li."orderItemId"
      JOIN orders o ON o.id = oi."orderId"
      JOIN plans pl ON pl.id = oi."planId"
      JOIN license_batches b ON b.id = li."batchId"
      WHERE li.status = 'SOLD'
    `);

    // Liberación idempotente: única implementación para job, barrido y cancelación del cliente.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_release_order(p_order_id uuid, p_reason text, p_require_expired boolean)
      RETURNS boolean LANGUAGE plpgsql AS $$
      DECLARE
        v_order orders%ROWTYPE;
      BEGIN
        SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
        IF NOT FOUND OR v_order.status <> 'PENDING_PAYMENT' THEN
          RETURN false;
        END IF;
        IF p_require_expired AND v_order."expiresAt" > now() THEN
          RETURN false;
        END IF;

        UPDATE license_items li
           SET status = 'AVAILABLE', "orderItemId" = NULL, "reservedUntil" = NULL
          FROM order_items oi
         WHERE oi."orderId" = p_order_id AND li."orderItemId" = oi.id AND li.status = 'RESERVED';

        UPDATE orders SET status = 'CANCELLED', "cancelReason" = p_reason WHERE id = p_order_id;
        RETURN true;
      END $$;
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION fn_release_expired() RETURNS SETOF uuid LANGUAGE plpgsql AS $$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT id FROM orders
           WHERE status = 'PENDING_PAYMENT' AND "expiresAt" <= now()
           ORDER BY "expiresAt"
           LIMIT 500
           FOR UPDATE SKIP LOCKED
        LOOP
          IF fn_release_order(r.id, 'EXPIRED', true) THEN
            RETURN NEXT r.id;
          END IF;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_release_expired()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_release_order(uuid, text, boolean)`);
    await queryRunner.query(`DROP VIEW IF EXISTS v_sales_lines`);
    await queryRunner.query(`DROP VIEW IF EXISTS v_plan_stock`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_payment_method_currency ON payments`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_payment_method_currency()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_audit_logs_immutable()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_order_items_total_check ON order_items`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_order_total_check ON orders`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_order_total_check()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_order_status_guard ON orders`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_order_status_guard()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_license_status_guard ON license_items`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_license_status_guard()`);
    for (const table of UPDATED_AT_TABLES) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_set_updated_at ON "${table}"`);
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS fn_set_updated_at()`);
    await queryRunner.query(`
      DO $$ BEGIN
        EXECUTE format('ALTER SEQUENCE %s START WITH 1 RESTART WITH 1',
                       pg_get_serial_sequence('orders', 'orderNumber'));
      END $$;
    `);
  }
}
```

- [ ] **Step 2: Factories de prueba** — `test/utils/factories.ts`

```ts
import { hashSync } from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { type Currency } from '../../src/database/currency';
import {
  Category,
  LicenseBatch,
  LicenseItem,
  PaymentMethod,
  Plan,
  PlanPrice,
  Product,
  User,
} from '../../src/database/entities';
import { LicenseStatus, OrderStatus, PaymentMethodKind, Role } from '../../src/database/enums';

export const TEST_PASSWORD = 'Password-123';
// Cost 4: rápido en pruebas. La app usa cost 12.
const TEST_PASSWORD_HASH = hashSync(TEST_PASSWORD, 4);

export async function createUser(ds: DataSource, overrides: Partial<User> = {}): Promise<User> {
  const repo = ds.getRepository(User);
  const user = await repo.save(
    repo.create({
      email: `user-${randomUUID()}@test.pe`,
      passwordHash: TEST_PASSWORD_HASH,
      role: Role.CUSTOMER,
      ...overrides,
    }),
  );
  return user;
}

export interface CatalogOptions {
  /** Precio por moneda; por defecto solo PEN 1000. */
  prices?: Partial<Record<Currency, number>>;
  stock?: number;
  requiresToolUsername?: boolean;
  costCurrency?: Currency;
  unitCostCents?: number;
  fxRatePen?: string | null;
  lowStockThreshold?: number;
  planName?: string;
}

export interface Catalog {
  product: Product;
  plan: Plan;
  batch: LicenseBatch;
  licenseIds: string[];
}

export async function createCatalog(ds: DataSource, options: CatalogOptions = {}): Promise<Catalog> {
  const suffix = randomUUID().slice(0, 8);
  const category = await ds.getRepository(Category).save({ name: `Categoría ${suffix}` });
  const product = await ds.getRepository(Product).save({
    name: `Producto ${suffix}`,
    slug: `producto-${suffix}`,
    description: null,
    categoryId: category.id,
    requiresToolUsername: options.requiresToolUsername ?? false,
  });
  const plan = await ds.getRepository(Plan).save({
    productId: product.id,
    name: options.planName ?? `Plan ${suffix}`,
    durationDays: 30,
    lowStockThreshold: options.lowStockThreshold ?? 5,
  });
  const prices = options.prices ?? { PEN: 1000 };
  for (const [currency, priceCents] of Object.entries(prices)) {
    await ds.getRepository(PlanPrice).save({ planId: plan.id, currency: currency as Currency, priceCents });
  }
  const costCurrency = options.costCurrency ?? 'USD';
  const batch = await ds.getRepository(LicenseBatch).save({
    planId: plan.id,
    supplier: null,
    unitCostCents: options.unitCostCents ?? 200,
    costCurrency,
    fxRatePen: options.fxRatePen !== undefined ? options.fxRatePen : costCurrency === 'USD' ? '3.6200' : null,
    notes: null,
  });
  const licenseIds: string[] = [];
  for (let i = 0; i < (options.stock ?? 5); i++) {
    const row = await ds.getRepository(LicenseItem).save({
      planId: plan.id,
      batchId: batch.id,
      // Las pruebas no descifran: basta un valor opaco y un hash único.
      secretEncrypted: 'test:test:test',
      secretHash: randomBytes(32).toString('hex'),
      status: LicenseStatus.AVAILABLE,
    });
    licenseIds.push(row.id);
  }
  return { product, plan, batch, licenseIds };
}

export async function createPaymentMethod(
  ds: DataSource,
  overrides: Partial<PaymentMethod> = {},
): Promise<PaymentMethod> {
  const repo = ds.getRepository(PaymentMethod);
  return repo.save(
    repo.create({
      code: `pm-${randomUUID().slice(0, 8)}`,
      name: '[Método de prueba]',
      kind: PaymentMethodKind.WALLET,
      currencies: ['PEN'],
      instructions: {},
      ...overrides,
    }),
  );
}

export interface InsertOrderInput {
  userId: string;
  currency: Currency;
  lines: { planId: string; unitPriceCents: number; licenseId?: string }[];
  status?: OrderStatus;
  expiresAt?: Date;
  /** Para probar el trigger de total: si se omite, se usa la suma de las líneas. */
  totalCents?: number;
}

/** Inserta un pedido por SQL, reservando las licencias indicadas, en una transacción. */
export async function insertOrder(ds: DataSource, input: InsertOrderInput): Promise<{ orderId: string }> {
  return ds.transaction(async (m) => {
    const total = input.totalCents ?? input.lines.reduce((sum, l) => sum + l.unitPriceCents, 0);
    const expiresAt = input.expiresAt ?? new Date(Date.now() + 30 * 60_000);
    const [{ id: orderId }]: { id: string }[] = await m.query(
      `INSERT INTO orders ("userId", status, "totalCents", currency, "expiresAt")
       VALUES ($1, 'PENDING_PAYMENT', $2, $3, $4) RETURNING id`,
      [input.userId, total, input.currency, expiresAt],
    );
    for (const line of input.lines) {
      const [{ id: itemId }]: { id: string }[] = await m.query(
        `INSERT INTO order_items ("orderId", "planId", "unitPriceCents") VALUES ($1, $2, $3) RETURNING id`,
        [orderId, line.planId, line.unitPriceCents],
      );
      if (line.licenseId) {
        await m.query(
          `UPDATE license_items SET status = 'RESERVED', "orderItemId" = $1, "reservedUntil" = $2 WHERE id = $3`,
          [itemId, expiresAt, line.licenseId],
        );
      }
    }
    if (input.status && input.status !== OrderStatus.PENDING_PAYMENT) {
      await m.query(`UPDATE orders SET status = $1 WHERE id = $2`, [input.status, orderId]);
    }
    return { orderId };
  });
}

/** Vacía todas las tablas excepto migrations (TRUNCATE no dispara el trigger de audit_logs). */
export async function truncateAll(ds: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await ds.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  await ds.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
```

- [ ] **Step 3: Escribir las pruebas que fallan** — `test/db-logic.e2e-spec.ts`

```ts
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { OrderStatus, PaymentMethodKind } from '../src/database/enums';
import { TEST_DATABASE_URL } from './setup-env';
import { createCatalog, createPaymentMethod, createUser, insertOrder, truncateAll } from './utils/factories';

describe('Lógica en base de datos (D57)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await new DataSource(buildDataSourceOptions({ DATABASE_URL: TEST_DATABASE_URL, DB_SSL: false })).initialize();
  });

  beforeEach(async () => {
    await truncateAll(ds);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('numera los pedidos desde 1001', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000 }],
    });
    const [row]: { orderNumber: number }[] = await ds.query(`SELECT "orderNumber" FROM orders WHERE id = $1`, [orderId]);
    expect(row.orderNumber).toBe(1001);
  });

  it('impide revender una licencia vendida (SOLD -> AVAILABLE)', async () => {
    const user = await createUser(ds);
    const { plan, licenseIds } = await createCatalog(ds, { stock: 1 });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] }],
    });
    await ds.query(`UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = $1`, [licenseIds[0]]);

    await expect(
      ds.query(
        `UPDATE license_items SET status = 'AVAILABLE', "orderItemId" = NULL, "reservedUntil" = NULL WHERE id = $1`,
        [licenseIds[0]],
      ),
    ).rejects.toThrow(/Transición de licencia no permitida/);
  });

  it('impide saltar estados del pedido (CANCELLED -> DELIVERED)', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000 }],
    });
    await ds.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = $1`, [orderId]);
    await expect(ds.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [orderId])).rejects.toThrow(
      /Transición de pedido no permitida/,
    );
  });

  it('rechaza al hacer COMMIT un pedido cuyo total no cuadra con sus líneas', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await expect(
      insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        totalCents: 999,
        lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      }),
    ).rejects.toThrow(/no coincide con sus líneas/);
    const [{ count }]: { count: string }[] = await ds.query(`SELECT count(*) FROM orders`);
    expect(Number(count)).toBe(0);
  });

  it('no deja modificar ni borrar audit_logs', async () => {
    await ds.query(
      `INSERT INTO audit_logs (action, entity, "entityId") VALUES ('test.action', 'test', 'x') RETURNING id`,
    );
    await expect(ds.query(`UPDATE audit_logs SET action = 'otro'`)).rejects.toThrow(/solo inserción/);
    await expect(ds.query(`DELETE FROM audit_logs`)).rejects.toThrow(/solo inserción/);
  });

  it('rechaza monedas fuera de PEN/USD', async () => {
    const { plan } = await createCatalog(ds);
    await expect(
      ds.query(`INSERT INTO plan_prices ("planId", currency, "priceCents") VALUES ($1, 'EUR', 100)`, [plan.id]),
    ).rejects.toThrow(/CHK_plan_prices_currency/);
  });

  it('exige fxRatePen en lotes en USD', async () => {
    const { plan } = await createCatalog(ds, { stock: 0 });
    await expect(
      ds.query(
        `INSERT INTO license_batches ("planId", "unitCostCents", "costCurrency", "fxRatePen") VALUES ($1, 200, 'USD', NULL)`,
        [plan.id],
      ),
    ).rejects.toThrow(/CHK_license_batches_fx/);
  });

  it('rechaza un método CRYPTO que acepte soles', async () => {
    await expect(
      createPaymentMethod(ds, { kind: PaymentMethodKind.CRYPTO, currencies: ['PEN'] }),
    ).rejects.toThrow(/CHK_payment_methods_crypto_usd/);
  });

  describe('método de pago según moneda (trg_payment_method_currency)', () => {
    async function pendingOrder(currency: 'PEN' | 'USD') {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds, { prices: { PEN: 1000, USD: 300 } });
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency,
        lines: [{ planId: plan.id, unitPriceCents: currency === 'PEN' ? 1000 : 300 }],
      });
      return orderId;
    }

    const insertPayment = (orderId: string, methodId: string, operation: string) =>
      ds.query(
        `INSERT INTO payments ("orderId", "paymentMethodId", "operationNumber", "proofKey", "proofHash")
         VALUES ($1, $2, $3, 'proofs/x.png', md5(random()::text) || md5(random()::text))`,
        [orderId, methodId, operation],
      );

    it('rechaza un método CRYPTO en un pedido en soles', async () => {
      const orderId = await pendingOrder('PEN');
      const crypto = await createPaymentMethod(ds, { kind: PaymentMethodKind.CRYPTO, currencies: ['USD'] });
      await expect(insertPayment(orderId, crypto.id, 'op-1')).rejects.toThrow(/Método de pago no válido/);
    });

    it('rechaza un método inactivo', async () => {
      const orderId = await pendingOrder('PEN');
      const wallet = await createPaymentMethod(ds, { active: false });
      await expect(insertPayment(orderId, wallet.id, 'op-1')).rejects.toThrow(/Método de pago no válido/);
    });

    it('acepta el mismo N.º de operación en métodos distintos (D64)', async () => {
      const orderA = await pendingOrder('PEN');
      const orderB = await pendingOrder('PEN');
      const yape = await createPaymentMethod(ds);
      const plin = await createPaymentMethod(ds);
      await insertPayment(orderA, yape.id, '123456');
      await expect(insertPayment(orderB, plin.id, '123456')).resolves.toBeDefined();
      await expect(insertPayment(orderB, yape.id, '123456')).rejects.toThrow(/UQ_payments_method_operation|duplicate/);
    });
  });

  it('v_plan_stock cuenta por estado y calcula stockState', async () => {
    const user = await createUser(ds);
    const { plan, licenseIds } = await createCatalog(ds, { stock: 3, lowStockThreshold: 2 });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] }],
    });
    const [row]: { available: number; reserved: number; stockState: string }[] = await ds.query(
      `SELECT available, reserved, "stockState" FROM v_plan_stock WHERE "planId" = $1`,
      [plan.id],
    );
    expect(row).toEqual({ available: 2, reserved: 1, stockState: 'LOW' });
  });

  it('v_sales_lines convierte el costo en USD con la tasa del lote', async () => {
    const user = await createUser(ds);
    const { plan, licenseIds } = await createCatalog(ds, {
      stock: 1,
      prices: { PEN: 1000 },
      costCurrency: 'USD',
      unitCostCents: 200,
      fxRatePen: '3.6200',
    });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] }],
    });
    await ds.query(`UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = $1`, [licenseIds[0]]);
    const [line]: { marginCents: number }[] = await ds.query(`SELECT "marginCents" FROM v_sales_lines`);
    // 1000 − round(200 × 3.62) = 1000 − 724
    expect(line.marginCents).toBe(276);
  });

  describe('fn_release_order', () => {
    it('libera un pedido vencido y devuelve sus licencias', async () => {
      const user = await createUser(ds);
      const { plan, licenseIds } = await createCatalog(ds, { stock: 1 });
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        expiresAt: new Date(Date.now() - 1000),
        lines: [{ planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] }],
      });

      const [{ released }]: { released: boolean }[] = await ds.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      expect(released).toBe(true);

      const [order]: { status: string; cancelReason: string }[] = await ds.query(
        `SELECT status, "cancelReason" FROM orders WHERE id = $1`,
        [orderId],
      );
      expect(order).toEqual({ status: 'CANCELLED', cancelReason: 'EXPIRED' });
      const [license]: { status: string; orderItemId: string | null }[] = await ds.query(
        `SELECT status, "orderItemId" FROM license_items WHERE id = $1`,
        [licenseIds[0]],
      );
      expect(license).toEqual({ status: 'AVAILABLE', orderItemId: null });
    });

    it('no libera un pedido que aún no vence cuando se exige vencimiento', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      });
      const [{ released }]: { released: boolean }[] = await ds.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      expect(released).toBe(false);
    });

    it('nunca libera un pedido IN_REVIEW (regla 3)', async () => {
      const user = await createUser(ds);
      const { plan, licenseIds } = await createCatalog(ds, { stock: 1 });
      const { orderId } = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        status: OrderStatus.IN_REVIEW,
        expiresAt: new Date(Date.now() - 1000),
        lines: [{ planId: plan.id, unitPriceCents: 1000, licenseId: licenseIds[0] }],
      });
      const [{ released }]: { released: boolean }[] = await ds.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      expect(released).toBe(false);
      const [license]: { status: string }[] = await ds.query(`SELECT status FROM license_items WHERE id = $1`, [
        licenseIds[0],
      ]);
      expect(license.status).toBe('RESERVED');
    });

    it('fn_release_expired libera solo los vencidos', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds, { stock: 0 });
      const expired = await insertOrder(ds, {
        userId: user.id,
        currency: 'PEN',
        expiresAt: new Date(Date.now() - 1000),
        lines: [{ planId: plan.id, unitPriceCents: 1000 }],
      });
      await insertOrder(ds, { userId: user.id, currency: 'PEN', lines: [{ planId: plan.id, unitPriceCents: 1000 }] });

      const rows: { id: string }[] = await ds.query(`SELECT fn_release_expired() AS id`);
      expect(rows.map((r) => r.id)).toEqual([expired.orderId]);
    });
  });
});
```

- [ ] **Step 4: Ejecutar y verificar que falla**

Run: `npm run test:e2e -- db-logic`
Expected: si la migración aún no tiene cuerpo, FAIL (por ejemplo `function fn_release_order(...) does not exist`, `orderNumber` igual a 1). Con el cuerpo del Step 1 ya pegado, el `globalSetup` la aplica: pasar directo al Step 5.

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `npm run test:e2e -- db-logic schema`
Expected: PASS (todas).

- [ ] **Step 6: Probar `down()` y volver a aplicar en desarrollo**

```bash
npm run migration:run      # aplica DatabaseLogic en la base de desarrollo
npm run migration:revert   # ejecuta down()
npm run migration:run      # vuelve a aplicarla
```

Expected: los tres comandos terminan sin error.

- [ ] **Step 7: Commit**

```bash
git add src/database/migrations test
git commit -m "Backend: triggers, vistas y funciones de liberación en Postgres

Transiciones de estado de licencias y pedidos, total verificado al
COMMIT, audit_logs inmutable, método de pago según moneda, vistas de
stock y ventas con margen por tasa del lote, y fn_release_order/
fn_release_expired idempotentes."
```

---
### Task 4: Cifrado de claves y auditoría

**Files:**
- Create: `backend/src/common/crypto/crypto.service.ts`, `backend/src/common/crypto/crypto.module.ts`
- Test: `backend/src/common/crypto/crypto.service.spec.ts`
- Create: `backend/src/audit/sanitize-meta.ts`, `backend/src/audit/audit.service.ts`, `backend/src/audit/audit.module.ts`
- Test: `backend/src/audit/sanitize-meta.spec.ts`

**Interfaces:**
- Consumes: `EnvironmentVariables` (Tarea 1), entidad `AuditLog` (Tarea 2).
- Produces: `LICENSE_ENC_KEY` (token de inyección, string base64); `class CryptoService { constructor(base64Key: string); encrypt(plain: string): string; decrypt(payload: string): string; hash(plain: string): string }`; `CryptoModule` (global); `sanitizeMeta(value: unknown): unknown`; `interface AuditEntry { actorId: string | null; action: string; entity: string; entityId: string; meta?: Record<string, unknown> }`; `class AuditService { log(manager: EntityManager, entry: AuditEntry): Promise<void> }`; `AuditModule` (global).

- [ ] **Step 1: Escribir las pruebas que fallan** — `src/common/crypto/crypto.service.spec.ts`

```ts
import { CryptoService } from './crypto.service';

const KEY = Buffer.alloc(32, 9).toString('base64');

describe('CryptoService', () => {
  const crypto = new CryptoService(KEY);

  it('cifra y descifra (ida y vuelta)', () => {
    const payload = crypto.encrypt('ABCD-1234-EFGH');
    expect(payload).not.toContain('ABCD-1234-EFGH');
    expect(crypto.decrypt(payload)).toBe('ABCD-1234-EFGH');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(crypto.encrypt('misma-clave')).not.toBe(crypto.encrypt('misma-clave'));
  });

  it('falla si el contenido fue alterado', () => {
    const [iv, tag, ct] = crypto.encrypt('ABCD-1234').split(':');
    const tampered = Buffer.from(ct, 'base64');
    tampered[0] = tampered[0] ^ 0xff;
    expect(() => crypto.decrypt(`${iv}:${tag}:${tampered.toString('base64')}`)).toThrow();
  });

  it('falla con un formato inválido', () => {
    expect(() => crypto.decrypt('no-es-un-payload')).toThrow('Formato de clave cifrada inválido');
  });

  it('hash es determinista, de 64 caracteres hex, y depende de la llave', () => {
    const otra = new CryptoService(Buffer.alloc(32, 1).toString('base64'));
    expect(crypto.hash('ABCD')).toBe(crypto.hash('ABCD'));
    expect(crypto.hash('ABCD')).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto.hash('ABCD')).not.toBe(otra.hash('ABCD'));
  });

  it('rechaza una llave que no mide 32 bytes', () => {
    expect(() => new CryptoService(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
```

`src/audit/sanitize-meta.spec.ts`:

```ts
import { sanitizeMeta } from './sanitize-meta';

describe('sanitizeMeta', () => {
  it('elimina llaves sensibles en cualquier nivel', () => {
    expect(
      sanitizeMeta({
        email: 'a@b.pe',
        password: 'x',
        refreshToken: 'y',
        nested: { secretValue: 'z', ok: 1, apiKey: 'k' },
        items: [{ planId: 'p', licenseSecret: 's' }],
      }),
    ).toEqual({ email: 'a@b.pe', nested: { ok: 1 }, items: [{ planId: 'p' }] });
  });

  it('deja intactos los valores primitivos y las fechas', () => {
    const date = new Date('2026-10-06T00:00:00Z');
    expect(sanitizeMeta({ at: date, n: 1, s: 'x', b: true, nil: null })).toEqual({
      at: date,
      n: 1,
      s: 'x',
      b: true,
      nil: null,
    });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npx jest src/common/crypto src/audit`
Expected: FAIL con `Cannot find module './crypto.service'` y `'./sanitize-meta'`.

- [ ] **Step 3: Implementar el cifrado**

`src/common/crypto/crypto.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

export const LICENSE_ENC_KEY = Symbol('LICENSE_ENC_KEY');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Cifrado de claves de licencia (regla 4). AES-256-GCM detecta alteraciones;
 * el hash es HMAC con una llave derivada (D58) para que un dump de la DB no permita confirmar claves.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly hmacKey: Buffer;

  constructor(@Inject(LICENSE_ENC_KEY) base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) {
      throw new Error('LICENSE_ENC_KEY debe medir 32 bytes');
    }
    this.hmacKey = Buffer.from(hkdfSync('sha256', this.key, Buffer.alloc(0), 'secret-hash', 32));
  }

  /** Devuelve `base64(iv):base64(tag):base64(ct)`. */
  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ciphertext].map((part) => part.toString('base64')).join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de clave cifrada inválido');
    }
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /** HMAC-SHA256 en hex (64 caracteres). Sirve para detectar claves duplicadas al cargar lotes. */
  hash(plain: string): string {
    return createHmac('sha256', this.hmacKey).update(plain, 'utf8').digest('hex');
  }
}
```

`src/common/crypto/crypto.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../core/config/env.validation';
import { CryptoService, LICENSE_ENC_KEY } from './crypto.service';

@Global()
@Module({
  providers: [
    {
      provide: LICENSE_ENC_KEY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => config.get('LICENSE_ENC_KEY', { infer: true }),
    },
    CryptoService,
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
```

- [ ] **Step 4: Implementar la auditoría**

`src/audit/sanitize-meta.ts`:

```ts
/** Llaves que nunca deben llegar a audit_logs (regla 4). */
const SENSITIVE_KEY = /(secret|password|token|key)/i;

/** Copia profunda de `value` sin las llaves sensibles. */
export function sanitizeMeta(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMeta);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .map(([key, nested]) => [key, sanitizeMeta(nested)]),
    );
  }
  return value;
}
```

`src/audit/audit.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditLog } from '../database/entities';
import { sanitizeMeta } from './sanitize-meta';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  /**
   * Recibe el EntityManager de la transacción del llamador: la auditoría se confirma
   * o se revierte junto con la mutación que describe (regla 6).
   */
  async log(manager: EntityManager, entry: AuditEntry): Promise<void> {
    await manager.insert(AuditLog, {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      meta: entry.meta ? (sanitizeMeta(entry.meta) as Record<string, unknown>) : null,
    });
  }
}
```

`src/audit/audit.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `npx jest src/common/crypto src/audit && npm run typecheck`
Expected: PASS (8 pruebas) y typecheck sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/common/crypto src/audit
git commit -m "Backend: cifrado AES-256-GCM, HMAC de claves y servicio de auditoría

El hash de duplicados usa HMAC con llave derivada (D58). La auditoría
escribe en la transacción del llamador y elimina llaves sensibles."
```

---

### Task 5: Núcleo de la aplicación — config, DB, Redis, colas, logs, errores, health y Swagger

**Files:**
- Create: `backend/src/core/redis/redis.module.ts`, `backend/src/core/core.module.ts`
- Create: `backend/src/common/decorators/public.decorator.ts`
- Create: `backend/src/common/filters/all-exceptions.filter.ts`
- Test: `backend/src/common/filters/all-exceptions.filter.spec.ts`
- Create: `backend/src/health/redis.health.ts`, `backend/src/health/health.controller.ts`, `backend/src/health/health.module.ts`
- Create: `backend/src/configure-app.ts`, `backend/src/swagger.ts`
- Modify: `backend/src/app.module.ts`, `backend/src/main.ts`
- Create: `backend/test/utils/test-app.ts`
- Test: `backend/test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: `validateEnv`, `EnvironmentVariables` (Tarea 1); `buildDataSourceOptions` (Tarea 2); `CryptoModule`, `AuditModule` (Tarea 4); `truncateAll` (Tarea 3).
- Produces: `REDIS_CLIENT` (token → instancia `Redis` de ioredis); `parseRedisUrl(raw: string)`; `CoreModule`; `IS_PUBLIC_KEY`, `Public()`; `AllExceptionsFilter`, `toErrorBody(exception: unknown): ErrorBody`; `configureApp(app: NestExpressApplication): void`; `setupSwagger(app: INestApplication): void`; en pruebas `createTestApp(options?: TestAppOptions): Promise<NestExpressApplication>` y `resetState(app: INestApplication): Promise<void>`.

- [ ] **Step 1: Escribir la prueba unitaria que falla** — `src/common/filters/all-exceptions.filter.spec.ts`

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { toErrorBody } from './all-exceptions.filter';

const pgError = (code: string) => new QueryFailedError('SELECT 1', [], Object.assign(new Error('pg'), { code }));

describe('toErrorBody', () => {
  it('conserva el estado y el mensaje de una HttpException', () => {
    expect(toErrorBody(new ConflictException('Sin stock suficiente de X'))).toEqual({
      statusCode: 409,
      message: 'Sin stock suficiente de X',
      error: 'Conflict',
    });
    expect(toErrorBody(new NotFoundException('Pedido no encontrado')).statusCode).toBe(404);
  });

  it('traduce una violación de unicidad de Postgres a 409', () => {
    expect(toErrorBody(pgError('23505'))).toEqual({
      statusCode: 409,
      message: 'El recurso ya existe',
      error: 'Conflict',
    });
  });

  it('traduce CHECK y errores de trigger a 409 sin filtrar detalles', () => {
    for (const code of ['23514', 'P0001']) {
      expect(toErrorBody(pgError(code))).toEqual({
        statusCode: 409,
        message: 'Operación no permitida en el estado actual',
        error: 'Conflict',
      });
    }
  });

  it('cualquier otro error es 500 genérico', () => {
    expect(toErrorBody(new Error('detalle interno con SQL'))).toEqual({
      statusCode: 500,
      message: 'Error interno',
      error: 'Internal Server Error',
    });
    expect(toErrorBody(pgError('42P01')).statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx jest src/common/filters`
Expected: FAIL con `Cannot find module './all-exceptions.filter'`.

- [ ] **Step 3: Implementar el filtro** — `src/common/filters/all-exceptions.filter.ts`

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

const conflict = (message: string): ErrorBody => ({ statusCode: 409, message, error: 'Conflict' });

/** Convierte cualquier excepción al formato público de docs/06, sin filtrar SQL ni stacks. */
export function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? exception.message);
    return { statusCode, message, error: STATUS_TEXT[statusCode] ?? 'Error' };
  }

  if (exception instanceof QueryFailedError) {
    const code = (exception.driverError as { code?: string } | undefined)?.code;
    if (code === '23505') return conflict('El recurso ya existe');
    if (code === '23514' || code === 'P0001') return conflict('Operación no permitida en el estado actual');
  }

  return { statusCode: 500, message: 'Error interno', error: 'Internal Server Error' };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ id?: string }>();
    const body = toErrorBody(exception);

    if (body.statusCode >= 500 || exception instanceof QueryFailedError) {
      // El detalle (SQL, stack) solo va al log, con el request id para correlacionar.
      this.logger.error({ err: exception, requestId: request.id }, 'Error al procesar la solicitud');
    }
    this.adapterHost.httpAdapter.reply(ctx.getResponse(), body, body.statusCode);
  }
}
```

Run: `npx jest src/common/filters`
Expected: PASS (4 pruebas).

- [ ] **Step 4: Redis compartido** — `src/core/redis/redis.module.ts`

```ts
import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { EnvironmentVariables } from '../config/env.validation';

/** Cliente ioredis para throttling y health. BullMQ abre sus propias conexiones. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Convierte REDIS_URL (redis:// o rediss://) en opciones de conexión para BullMQ. */
export function parseRedisUrl(raw: string) {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true }), { maxRetriesPerRequest: 3 }),
    },
    RedisShutdown,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
```

- [ ] **Step 5: CoreModule** — `src/core/core.module.ts`

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from '../audit/audit.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { buildDataSourceOptions } from '../database/data-source-options';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { parseRedisUrl, RedisModule } from './redis/redis.module';

/** Nunca se registran credenciales, tokens ni claves (regla 4). */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.refreshToken',
  '*.accessToken',
  '*.secret',
];

/** Propaga X-Request-Id si llega (máx. 100 caracteres) o genera uno, y lo devuelve en la respuesta. */
function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 100 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** Infraestructura compartida por la API y el worker. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: requestId,
          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
          autoLogging: { ignore: (req: IncomingMessage) => (req.url ?? '').startsWith('/health') },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildDataSourceOptions({
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          DB_SSL: config.get('DB_SSL', { infer: true }),
        }),
    }),
    RedisModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        connection: parseRedisUrl(config.get('REDIS_URL', { infer: true })),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      }),
    }),
    CryptoModule,
    AuditModule,
  ],
})
export class CoreModule {}
```

- [ ] **Step 6: Decorador `@Public()`** — `src/common/decorators/public.decorator.ts`

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una ruta como accesible sin sesión (el JwtAuthGuard es global). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 7: Health**

`src/health/redis.health.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async isHealthy(key: string) {
    const check = this.indicator.check(key);
    try {
      await this.redis.ping();
      return check.up();
    } catch {
      return check.down({ message: 'Sin conexión con Redis' });
    }
  }
}
```

`src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { RedisHealthIndicator } from './redis.health';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /** Liveness: el proceso responde. */
  @Get()
  live() {
    return { status: 'ok' };
  }

  /** Readiness: Postgres y Redis disponibles; 503 si alguno falla. */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingCheck('database'), () => this.redis.isHealthy('redis')]);
  }
}
```

`src/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
```

- [ ] **Step 8: Bootstrap HTTP compartido**

`src/configure-app.ts`:

```ts
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvironmentVariables } from './core/config/env.validation';

/** Configuración HTTP común a main.ts y a las pruebas e2e. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);

  // Fly.io termina TLS en su proxy: req.ip debe venir de X-Forwarded-For (rate limit por IP).
  app.set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  });
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
}
```

`src/swagger.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** OpenAPI en /docs. Solo fuera de producción (lo decide main.ts). */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Free Cell API')
    .setDescription('API de la tienda de licencias Free Cell')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
}
```

`src/app.module.ts` (versión de esta tarea; las Tareas 6, 8 y 9 la amplían):

```ts
import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [CoreModule, HealthModule],
})
export class AppModule {}
```

`src/main.ts`:

```ts
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { EnvironmentVariables } from './core/config/env.validation';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
```

- [ ] **Step 9: Utilidades de prueba** — `test/utils/test-app.ts`

```ts
import { INestApplication, Type } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { REDIS_CLIENT } from '../../src/core/redis/redis.module';
import { truncateAll } from './factories';

export interface TestAppOptions {
  /** Módulos extra (por ejemplo, NotificationsDeliveryModule). */
  imports?: Type[];
  /** Controladores solo de prueba (por ejemplo, una ruta protegida con @Roles). */
  controllers?: Type[];
  /** Para overrideProvider(...). */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    controllers: options.controllers ?? [],
  });
  if (options.configure) {
    builder = options.configure(builder);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

/** Base vacía y Redis /1 vacío (colas y contadores de rate limit incluidos). */
export async function resetState(app: INestApplication): Promise<void> {
  await truncateAll(app.get(DataSource));
  await app.get<Redis>(REDIS_CLIENT).flushdb();
}
```

- [ ] **Step 10: Escribir la prueba e2e** — `test/health.e2e-spec.ts`

```ts
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('Health y transversales HTTP', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('GET /health/ready verifica Postgres y Redis', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.database.status).toBe('up');
    expect(res.body.info.redis.status).toBe('up');
  });

  it('propaga o genera X-Request-Id', async () => {
    const echoed = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'abc-123');
    expect(echoed.headers['x-request-id']).toBe('abc-123');
    const generated = await request(app.getHttpServer()).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aplica cabeceras de seguridad (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('una ruta inexistente usa el formato de error estándar', async () => {
    const res = await request(app.getHttpServer()).get('/no-existe').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('rechaza cuerpos JSON de más de 100 kb', async () => {
    await request(app.getHttpServer())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(110 * 1024) }))
      .expect(413);
  });
});
```

- [ ] **Step 11: Ejecutar las pruebas**

Run: `npm run test:e2e -- health`
Expected: PASS (6 pruebas). Si `X-Request-Id` no aparece en la respuesta, verificar que `LoggerModule` está en `CoreModule` (su middleware es el que llama a `genReqId`).

- [ ] **Step 12: Verificación manual del arranque**

```bash
npm run start:dev
```

En otra terminal:

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/health/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs
```

Expected: `{"status":"ok"}`, un JSON con `"status":"ok"` y `200`. Detener el servidor (Ctrl+C) y confirmar que termina sin errores. Si helmet bloquea los scripts de `/docs` en el navegador, anotarlo en el informe; no relajar CSP en esta tarea.

- [ ] **Step 13: Typecheck, unitarias y commit**

Run: `npm run typecheck && npm test`
Expected: sin errores; todas las unitarias en verde.

```bash
git add src test
git commit -m "Backend: núcleo HTTP con health, logs pino, errores y Swagger

CoreModule compartido (config validada, TypeORM, Redis, BullMQ, pino con
request id y redacción). Filtro global que traduce errores de Postgres
sin filtrar SQL. /health, /health/ready y /docs fuera de producción."
```

---

### Task 6: Autenticación — registro, login, refresh rotativo, guards y rate limit

**Files:**
- Create: `backend/src/common/types/authenticated-user.ts`, `backend/src/common/decorators/roles.decorator.ts`, `backend/src/common/decorators/current-user.decorator.ts`
- Create: `backend/src/users/users.service.ts`, `backend/src/users/users.module.ts`
- Create: `backend/src/auth/refresh-policy.ts`
- Test: `backend/src/auth/refresh-policy.spec.ts`
- Create: `backend/src/auth/refresh-tokens.service.ts`, `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/auth/jwt.strategy.ts`, `backend/src/auth/guards/jwt-auth.guard.ts`, `backend/src/auth/guards/roles.guard.ts`, `backend/src/auth/auth.module.ts`
- Create: `backend/src/auth/dto/register.dto.ts`, `backend/src/auth/dto/login.dto.ts`, `backend/src/auth/dto/refresh.dto.ts`, `backend/src/auth/dto/auth-response.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `User`, `RefreshToken`, `Role`, `RefreshRevokeReason` (Tarea 2); `AuditService` (Tarea 4); `REDIS_CLIENT`, `CoreModule`, `Public`, `IS_PUBLIC_KEY`, `createTestApp`, `resetState` (Tarea 5); `createUser`, `TEST_PASSWORD` (Tarea 3).
- Produces: `interface AuthenticatedUser { id: string; role: Role }`; `@Roles(...roles: Role[])`, `ROLES_KEY`; `@CurrentUser()`; `UsersService.normalizeEmail(email): string` (estático), `UsersService.findById(id): Promise<User | null>`, `UsersService.findByEmailWithPassword(email): Promise<User | null>`; `UsersModule`; `decideRefresh(token, familyRevoked, now): RefreshDecision`; `REFRESH_GRACE_MS = 30_000`; `AuthModule` (exporta `JwtModule`); guards globales `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`. Las pruebas firman access tokens con `app.get(JwtService).sign({ sub, role })`.

- [ ] **Step 1: Escribir la prueba unitaria que falla** — `src/auth/refresh-policy.spec.ts`

```ts
import { RefreshRevokeReason } from '../database/enums';
import { decideRefresh, REFRESH_GRACE_MS } from './refresh-policy';

const now = new Date('2026-10-06T12:00:00Z');
const future = new Date(now.getTime() + 86_400_000);
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('decideRefresh', () => {
  it('INVALID si el token no existe', () => {
    expect(decideRefresh(null, false, now)).toBe('INVALID');
  });

  it('ROTATE si está vigente y no revocado', () => {
    expect(decideRefresh({ expiresAt: future, revokedAt: null, revokedReason: null }, false, now)).toBe('ROTATE');
  });

  it('INVALID si venció sin haber sido revocado', () => {
    expect(decideRefresh({ expiresAt: ago(1), revokedAt: null, revokedReason: null }, false, now)).toBe('INVALID');
  });

  it('GRACE si se rotó hace menos de 30 s y la familia sigue activa', () => {
    const token = {
      expiresAt: future,
      revokedAt: ago(REFRESH_GRACE_MS - 1_000),
      revokedReason: RefreshRevokeReason.ROTATED,
    };
    expect(decideRefresh(token, false, now)).toBe('GRACE');
  });

  it('REUSE si se rotó hace más de 30 s', () => {
    const token = {
      expiresAt: future,
      revokedAt: ago(REFRESH_GRACE_MS + 1_000),
      revokedReason: RefreshRevokeReason.ROTATED,
    };
    expect(decideRefresh(token, false, now)).toBe('REUSE');
  });

  it('REUSE dentro de la ventana si la familia ya fue revocada', () => {
    const token = { expiresAt: future, revokedAt: ago(1_000), revokedReason: RefreshRevokeReason.ROTATED };
    expect(decideRefresh(token, true, now)).toBe('REUSE');
  });

  it('REUSE si fue revocado por logout o por reuso', () => {
    for (const reason of [RefreshRevokeReason.LOGOUT, RefreshRevokeReason.REUSE_DETECTED]) {
      expect(decideRefresh({ expiresAt: future, revokedAt: ago(1_000), revokedReason: reason }, false, now)).toBe(
        'REUSE',
      );
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx jest src/auth/refresh-policy.spec.ts`
Expected: FAIL con `Cannot find module './refresh-policy'`.

- [ ] **Step 3: Implementar la política** — `src/auth/refresh-policy.ts`

```ts
import { RefreshRevokeReason } from '../database/enums';

export type RefreshDecision = 'ROTATE' | 'GRACE' | 'REUSE' | 'INVALID';

/** Ventana en la que un token recién rotado puede volver a usarse (varias pestañas, D56). */
export const REFRESH_GRACE_MS = 30_000;

export interface RefreshTokenState {
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: RefreshRevokeReason | null;
}

/**
 * Decide qué hacer con un refresh token presentado.
 * `familyRevoked`: la familia ya tiene tokens revocados por LOGOUT o REUSE_DETECTED.
 */
export function decideRefresh(
  token: RefreshTokenState | null,
  familyRevoked: boolean,
  now: Date,
): RefreshDecision {
  if (!token) return 'INVALID';
  if (token.revokedAt === null) {
    return token.expiresAt <= now ? 'INVALID' : 'ROTATE';
  }
  const withinGrace = now.getTime() - token.revokedAt.getTime() < REFRESH_GRACE_MS;
  if (token.revokedReason === RefreshRevokeReason.ROTATED && withinGrace && !familyRevoked && token.expiresAt > now) {
    return 'GRACE';
  }
  return 'REUSE';
}
```

Run: `npx jest src/auth/refresh-policy.spec.ts`
Expected: PASS (7 pruebas).

- [ ] **Step 4: Tipos y decoradores comunes**

`src/common/types/authenticated-user.ts`:

```ts
import { Role } from '../../database/enums';

/** Lo que el JwtStrategy deja en request.user. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}
```

`src/common/decorators/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { Role } from '../../database/enums';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

`src/common/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../types/authenticated-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
```

- [ ] **Step 5: Usuarios**

`src/users/users.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** passwordHash tiene select:false; aquí se pide explícitamente. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: UsersService.normalizeEmail(email) })
      .getOne();
  }
}
```

`src/users/users.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: DTOs**

`src/auth/dto/register.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'cliente@correo.pe' })
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @MaxLength(254, { message: 'El correo es demasiado largo' })
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString({ message: 'La contraseña debe ser texto' })
  @Length(8, 72, { message: 'La contraseña debe tener entre 8 y 72 caracteres' })
  password!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(80, { message: 'El nombre admite hasta 80 caracteres' })
  name?: string;
}
```

`src/auth/dto/login.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'cliente@correo.pe' })
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  email!: string;

  @ApiProperty()
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'Ingresa tu contraseña' })
  @MaxLength(72, { message: 'La contraseña admite hasta 72 caracteres' })
  password!: string;
}
```

`src/auth/dto/refresh.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty()
  @IsString({ message: 'El refresh token debe ser texto' })
  @IsNotEmpty({ message: 'Falta el refresh token' })
  @MaxLength(200, { message: 'Refresh token inválido' })
  refreshToken!: string;
}
```

`src/auth/dto/auth-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../database/entities';
import { Role } from '../../database/enums';

/** Perfil público: nunca incluye passwordHash ni googleId. */
export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: Date, nullable: true }) emailVerifiedAt!: Date | null;

  static from(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
}

export class TokenPairDto {
  @ApiProperty({ description: 'JWT de 15 minutos' }) accessToken!: string;
  @ApiProperty({ description: 'Token opaco de 30 días, rotativo' }) refreshToken!: string;
}

export class AuthResponseDto extends TokenPairDto {
  @ApiProperty({ type: UserDto }) user!: UserDto;
}
```

- [ ] **Step 7: Refresh tokens** — `src/auth/refresh-tokens.service.ts`

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EnvironmentVariables } from '../core/config/env.validation';
import { RefreshToken } from '../database/entities';
import { RefreshRevokeReason } from '../database/enums';
import { decideRefresh } from './refresh-policy';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_SESSION = 'Sesión inválida, vuelve a iniciar sesión';

@Injectable()
export class RefreshTokensService {
  private readonly pepper: string;

  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.pepper = config.get('JWT_REFRESH_PEPPER', { infer: true });
  }

  private hash(raw: string): string {
    return createHmac('sha256', this.pepper).update(raw).digest('hex');
  }

  /** Crea un token nuevo. Sin `familyId` abre una familia (login o registro). */
  async issue(
    manager: EntityManager,
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<{ id: string; raw: string }> {
    const raw = randomBytes(64).toString('base64url');
    const row = await manager.save(
      RefreshToken,
      manager.create(RefreshToken, {
        userId,
        familyId,
        tokenHash: this.hash(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      }),
    );
    return { id: row.id, raw };
  }

  /**
   * Rota un refresh token (D56). El FOR UPDATE serializa refresh simultáneos del mismo token:
   * el primero rota y el segundo entra por la ventana de gracia.
   */
  async rotate(raw: string): Promise<{ userId: string; refreshToken: string }> {
    const outcome = await this.ds.transaction(async (m) => {
      const token = await m.findOne(RefreshToken, {
        where: { tokenHash: this.hash(raw) },
        lock: { mode: 'pessimistic_write' },
      });
      const familyRevoked = token
        ? await m.exists(RefreshToken, {
            where: {
              familyId: token.familyId,
              revokedReason: In([RefreshRevokeReason.LOGOUT, RefreshRevokeReason.REUSE_DETECTED]),
            },
          })
        : false;
      const decision = decideRefresh(token, familyRevoked, new Date());

      if (decision === 'INVALID' || !token) return null;

      if (decision === 'REUSE') {
        // Posible robo: cae toda la familia. Se confirma la revocación y luego se responde 401.
        await m.update(
          RefreshToken,
          { familyId: token.familyId, revokedAt: IsNull() },
          { revokedAt: new Date(), revokedReason: RefreshRevokeReason.REUSE_DETECTED },
        );
        await this.audit.log(m, {
          actorId: token.userId,
          action: 'auth.refresh_reuse_detected',
          entity: 'refresh_family',
          entityId: token.familyId,
          meta: { familyId: token.familyId },
        });
        return null;
      }

      const next = await this.issue(m, token.userId, token.familyId);
      if (decision === 'ROTATE') {
        await m.update(
          RefreshToken,
          { id: token.id },
          { revokedAt: new Date(), revokedReason: RefreshRevokeReason.ROTATED, replacedById: next.id },
        );
      }
      return { userId: token.userId, refreshToken: next.raw };
    });

    if (!outcome) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    return outcome;
  }

  /** Logout: revoca la familia del token, solo si pertenece al usuario. */
  async revokeFamily(userId: string, raw: string): Promise<void> {
    const repo = this.ds.getRepository(RefreshToken);
    const token = await repo.findOne({ where: { tokenHash: this.hash(raw), userId } });
    if (!token) return;
    await repo.update(
      { familyId: token.familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: RefreshRevokeReason.LOGOUT },
    );
  }
}
```

- [ ] **Step 8: AuthService** — `src/auth/auth.service.ts`

```ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { User } from '../database/entities';
import { Role } from '../database/enums';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, TokenPairDto, UserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokensService } from './refresh-tokens.service';

const BCRYPT_COST = 12;
const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';

@Injectable()
export class AuthService {
  /** Se compara contra este hash cuando el correo no existe, para igualar el tiempo de respuesta. */
  private readonly dummyHash = hash('free-cell-dummy-password', BCRYPT_COST);

  constructor(
    private readonly ds: DataSource,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly audit: AuditService,
  ) {}

  /** El rol siempre es CUSTOMER: ADMIN solo por seed (RF-AUT-04). */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = UsersService.normalizeEmail(dto.email);
    const passwordHash = await hash(dto.password, BCRYPT_COST);
    return this.ds.transaction(async (m) => {
      if (await m.exists(User, { where: { email } })) {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      const user = await m.save(
        User,
        m.create(User, { email, passwordHash, name: dto.name?.trim() || null, role: Role.CUSTOMER }),
      );
      return this.buildAuthResponse(m, user);
    });
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const passwordOk = await compare(dto.password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !user.passwordHash || !passwordOk) {
      await this.audit.log(this.ds.manager, {
        actorId: user?.id ?? null,
        action: 'auth.login_failed',
        entity: 'user',
        entityId: user?.id ?? 'unknown',
        meta: { email: UsersService.normalizeEmail(dto.email) },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.ds.transaction((m) => this.buildAuthResponse(m, user));
  }

  async refresh(rawRefreshToken: string): Promise<TokenPairDto> {
    const { userId, refreshToken } = await this.refreshTokens.rotate(rawRefreshToken);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Sesión inválida, vuelve a iniciar sesión');
    }
    return { accessToken: this.signAccess(user), refreshToken };
  }

  logout(userId: string, rawRefreshToken: string): Promise<void> {
    return this.refreshTokens.revokeFamily(userId, rawRefreshToken);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Debes iniciar sesión');
    }
    return UserDto.from(user);
  }

  private signAccess(user: Pick<User, 'id' | 'role'>): string {
    return this.jwt.sign({ sub: user.id, role: user.role });
  }

  private async buildAuthResponse(manager: EntityManager, user: User): Promise<AuthResponseDto> {
    const { raw } = await this.refreshTokens.issue(manager, user.id);
    return { accessToken: this.signAccess(user), refreshToken: raw, user: UserDto.from(user) };
  }
}
```

- [ ] **Step 9: Strategy, guards, controller y módulos**

`src/auth/jwt.strategy.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { EnvironmentVariables } from '../core/config/env.validation';
import { Role } from '../database/enums';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  validate(payload: { sub: string; role: Role }): AuthenticatedUser {
    return { id: payload.sub, role: payload.role };
  }
}
```

`src/auth/guards/jwt-auth.guard.ts`:

```ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/** Global: toda ruta exige sesión salvo las marcadas con @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Debes iniciar sesión');
    }
    return user;
  }
}
```

`src/auth/guards/roles.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Role } from '../../database/enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (user && roles.includes(user.role)) return true;
    throw new ForbiddenException('No tienes permiso para esta acción');
  }
}
```

`src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { AuthResponseDto, TokenPairDto, UserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

const PER_MINUTE = 60_000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: PER_MINUTE } })
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: PER_MINUTE } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<TokenPairDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(204)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser, @Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(user.id, dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.auth.me(user.id);
  }
}
```

`src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EnvironmentVariables } from '../core/config/env.validation';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokensService } from './refresh-tokens.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokensService, JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
```

`src/app.module.ts` (reemplazar completo):

```ts
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CoreModule } from './core/core.module';
import { REDIS_CLIENT } from './core/redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    CoreModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        // Contadores en Redis: el límite se comparte entre todas las máquinas de la API.
        storage: new ThrottlerStorageRedisService(redis),
        errorMessage: 'Demasiados intentos, espera un momento',
        // Se lee en cada request para que las pruebas puedan activarlo solo donde lo verifican.
        skipIf: () => process.env.THROTTLE_ENABLED === 'false',
      }),
    }),
    HealthModule,
    AuthModule,
  ],
  providers: [
    // Orden: rate limit → sesión → rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

Run: `npm run typecheck`
Expected: sin errores (si aparece TS1272, ese tipo de un parámetro decorado debe importarse con `import type`).

- [ ] **Step 10: Escribir las pruebas e2e** — `test/auth.e2e-spec.ts`

```ts
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
    http().post('/auth/register').send({ email, password: TEST_PASSWORD, name: 'Cliente' });
  const login = (email: string, password = TEST_PASSWORD) => http().post('/auth/login').send({ email, password });
  const refresh = (refreshToken: string) => http().post('/auth/refresh').send({ refreshToken });
  const auditCount = async (action: string) => {
    const [{ count }]: { count: string }[] = await ds.query(`SELECT count(*) FROM audit_logs WHERE action = $1`, [
      action,
    ]);
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
    expect(res.body.user).toMatchObject({ email: 'cliente@test.pe', role: 'CUSTOMER', name: 'Cliente' });
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rechaza un campo role en el body', async () => {
    await http().post('/auth/register').send({ email: 'a@test.pe', password: TEST_PASSWORD, role: 'ADMIN' }).expect(400);
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
    const wrongPassword = await login('cliente@test.pe', 'otra-clave-123').expect(401);
    const unknownEmail = await login('nadie@test.pe').expect(401);
    expect(wrongPassword.body.message).toBe('Correo o contraseña incorrectos');
    expect(unknownEmail.body.message).toBe('Correo o contraseña incorrectos');
    expect(await auditCount('auth.login_failed')).toBe(2);
  });

  it('GET /auth/me devuelve el perfil sin datos sensibles', async () => {
    const { body } = await register();
    const res = await http().get('/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['email', 'emailVerifiedAt', 'id', 'name', 'phone', 'role']);
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
      .set('Authorization', `Bearer ${jwt.sign({ sub: customer.id, role: customer.role })}`)
      .expect(403);
    await http()
      .get('/test-admin')
      .set('Authorization', `Bearer ${jwt.sign({ sub: admin.id, role: admin.role })}`)
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
      const r2 = (await refresh(body.refreshToken).expect(200)).body.refreshToken as string;
      const r3 = (await refresh(body.refreshToken).expect(200)).body.refreshToken as string;
      expect(r3).not.toBe(r2);
      await refresh(r2).expect(200);
      await refresh(r3).expect(200);
    });

    it('reuso fuera de la ventana revoca toda la familia', async () => {
      const { body } = await register();
      const r2 = (await refresh(body.refreshToken).expect(200)).body.refreshToken as string;
      await ds.query(
        `UPDATE refresh_tokens SET "revokedAt" = now() - interval '1 minute' WHERE "revokedReason" = 'ROTATED'`,
      );
      await refresh(body.refreshToken).expect(401);
      await refresh(r2).expect(401);
      expect(await auditCount('auth.refresh_reuse_detected')).toBeGreaterThanOrEqual(1);
    });

    it('dos refresh simultáneos con el mismo token tienen éxito y la familia sigue activa', async () => {
      const { body } = await register();
      const [a, b] = await Promise.all([refresh(body.refreshToken), refresh(body.refreshToken)]);
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
```

- [ ] **Step 11: Ejecutar las pruebas**

Run: `npm run test:e2e -- auth`
Expected: PASS (15 pruebas).
Run: `npm test && npm run test:e2e`
Expected: todo en verde (unitarias y todas las e2e anteriores).

- [ ] **Step 12: Commit**

```bash
git add src test
git commit -m "Backend: auth con JWT de 15 min y refresh rotativo con ventana de gracia

Registro, login, refresh, logout y /auth/me. Guards globales (sesión por
defecto, @Public, @Roles), rate limit en Redis y detección de reuso de
refresh por familia con ventana de 30 s para pestañas paralelas (D56)."
```

---

### Task 7: Notificaciones idempotentes

**Files:**
- Create: `backend/src/notifications/notification.types.ts`
- Create: `backend/src/notifications/channels/notification-channel.ts`, `backend/src/notifications/channels/log.channel.ts`
- Create: `backend/src/notifications/notifications.service.ts`, `backend/src/notifications/notification-sender.service.ts`, `backend/src/notifications/notifications.processor.ts`
- Create: `backend/src/notifications/notifications.module.ts`, `backend/src/notifications/notifications-delivery.module.ts`, `backend/src/notifications/notifications-worker.module.ts`
- Test: `backend/test/notifications.e2e-spec.ts`

**Interfaces:**
- Consumes: `CoreModule` (cola BullMQ raíz), `createTestApp`, `resetState` (Tarea 5).
- Produces: `QUEUE_NOTIFICATIONS = 'notifications'`; `type NotificationTemplate = 'order-created'`; `interface NotificationJob { key: string; template: NotificationTemplate; recipient: string; data: Record<string, string | number> }`; `NOTIFICATION_CHANNEL` (token); `interface NotificationChannel { readonly name: string; send(job: NotificationJob): Promise<void> }`; `maskEmail(email: string): string`; `NotificationsService.enqueue(job: NotificationJob): Promise<void>`; `NotificationSender.handle(job: NotificationJob): Promise<'sent' | 'skipped'>`; módulos `NotificationsModule` (cola + enqueue, para la API), `NotificationsDeliveryModule` (sender + canal, sin worker), `NotificationsWorkerModule` (processor).

> Las llaves usan `-` como separador (`order-created-<orderId>`) porque también son el `jobId` de BullMQ, y conviene evitar `:` en ids personalizados.

- [ ] **Step 1: Tipos y canal**

`src/notifications/notification.types.ts`:

```ts
export const QUEUE_NOTIFICATIONS = 'notifications';

export type NotificationTemplate = 'order-created';

export interface NotificationJob {
  /** Identifica el mensaje de forma única (p. ej. `order-created-<orderId>`). También es el jobId. */
  key: string;
  template: NotificationTemplate;
  recipient: string;
  /** Datos para la plantilla. Nunca claves de licencia ni tokens. */
  data: Record<string, string | number>;
}
```

`src/notifications/channels/notification-channel.ts`:

```ts
import type { NotificationJob } from '../notification.types';

export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** Proveedor de envío. Sprint 3 agrega Resend (correo) y enlaces wa.me. */
export interface NotificationChannel {
  readonly name: string;
  send(job: NotificationJob): Promise<void>;
}
```

`src/notifications/channels/log.channel.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { NotificationJob } from '../notification.types';
import type { NotificationChannel } from './notification-channel';

/** `juan@correo.pe` → `j***@correo.pe`. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return domain ? `${user.slice(0, 1)}***@${domain}` : '***';
}

/** Canal de Fundaciones: solo registra en el log, con el destinatario enmascarado. */
@Injectable()
export class LogChannel implements NotificationChannel {
  readonly name = 'log';
  private readonly logger = new Logger('Notifications');

  send(job: NotificationJob): Promise<void> {
    this.logger.log(
      { key: job.key, template: job.template, recipient: maskEmail(job.recipient) },
      'Notificación enviada (canal de log)',
    );
    return Promise.resolve();
  }
}
```

- [ ] **Step 2: Encolado, envío idempotente y processor**

`src/notifications/notifications.service.ts`:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NotificationJob, QUEUE_NOTIFICATIONS } from './notification.types';

@Injectable()
export class NotificationsService {
  constructor(@InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue<NotificationJob>) {}

  /** jobId = key: encolar dos veces el mismo mensaje no crea dos jobs. */
  async enqueue(job: NotificationJob): Promise<void> {
    await this.queue.add(job.template, job, { jobId: job.key });
  }
}
```

`src/notifications/notification-sender.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NOTIFICATION_CHANNEL } from './channels/notification-channel';
import type { NotificationChannel } from './channels/notification-channel';
import type { NotificationJob } from './notification.types';

@Injectable()
export class NotificationSender {
  constructor(
    private readonly ds: DataSource,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  /**
   * 1) Reclama la huella en notification_logs (key única). Si ya existe, el mensaje ya salió.
   * 2) Envía. Si falla, libera la huella para que el reintento de BullMQ pueda enviarlo.
   */
  async handle(job: NotificationJob): Promise<'sent' | 'skipped'> {
    const claimed: { id: string }[] = await this.ds.query(
      `INSERT INTO notification_logs (key, channel, recipient, template)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING
       RETURNING id`,
      [job.key, this.channel.name, job.recipient, job.template],
    );
    if (claimed.length === 0) {
      return 'skipped';
    }

    try {
      await this.channel.send(job);
      return 'sent';
    } catch (error) {
      await this.ds.query(`DELETE FROM notification_logs WHERE key = $1`, [job.key]);
      throw error;
    }
  }
}
```

`src/notifications/notifications.processor.ts`:

```ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationSender } from './notification-sender.service';
import { NotificationJob, QUEUE_NOTIFICATIONS } from './notification.types';

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly sender: NotificationSender) {
    super();
  }

  process(job: Job<NotificationJob>): Promise<'sent' | 'skipped'> {
    return this.sender.handle(job.data);
  }
}
```

- [ ] **Step 3: Módulos**

`src/notifications/notifications.module.ts`:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NOTIFICATIONS } from './notification.types';
import { NotificationsService } from './notifications.service';

/** Lado productor (API): registra la cola y expone enqueue. */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS })],
  providers: [NotificationsService],
  exports: [NotificationsService, BullModule],
})
export class NotificationsModule {}
```

`src/notifications/notifications-delivery.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LogChannel } from './channels/log.channel';
import { NOTIFICATION_CHANNEL } from './channels/notification-channel';
import { NotificationSender } from './notification-sender.service';

/** Envío sin worker: las pruebas lo usan directo y el worker lo envuelve con el processor. */
@Module({
  providers: [NotificationSender, { provide: NOTIFICATION_CHANNEL, useClass: LogChannel }],
  exports: [NotificationSender],
})
export class NotificationsDeliveryModule {}
```

`src/notifications/notifications-worker.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsDeliveryModule } from './notifications-delivery.module';
import { NotificationsModule } from './notifications.module';
import { NotificationsProcessor } from './notifications.processor';

@Module({
  imports: [NotificationsModule, NotificationsDeliveryModule],
  providers: [NotificationsProcessor],
})
export class NotificationsWorkerModule {}
```

- [ ] **Step 4: Escribir las pruebas e2e** — `test/notifications.e2e-spec.ts`

```ts
import { getQueueToken } from '@nestjs/bullmq';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { NOTIFICATION_CHANNEL } from '../src/notifications/channels/notification-channel';
import type { NotificationChannel } from '../src/notifications/channels/notification-channel';
import { maskEmail } from '../src/notifications/channels/log.channel';
import { NotificationSender } from '../src/notifications/notification-sender.service';
import { NotificationJob, QUEUE_NOTIFICATIONS } from '../src/notifications/notification.types';
import { NotificationsDeliveryModule } from '../src/notifications/notifications-delivery.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationsService } from '../src/notifications/notifications.service';
import { createTestApp, resetState } from './utils/test-app';

class FakeChannel implements NotificationChannel {
  readonly name = 'fake';
  sent: NotificationJob[] = [];
  failNext = 0;

  send(job: NotificationJob): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('Proveedor caído'));
    }
    this.sent.push(job);
    return Promise.resolve();
  }
}

const job = (key = 'order-created-test'): NotificationJob => ({
  key,
  template: 'order-created',
  recipient: 'cliente@test.pe',
  data: { orderNumber: 1001 },
});

describe('Notificaciones', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  const channel = new FakeChannel();

  const logCount = async () => {
    const [{ count }]: { count: string }[] = await ds.query(`SELECT count(*) FROM notification_logs`);
    return Number(count);
  };

  beforeAll(async () => {
    app = await createTestApp({
      imports: [NotificationsModule, NotificationsDeliveryModule],
      configure: (builder) => builder.overrideProvider(NOTIFICATION_CHANNEL).useValue(channel),
    });
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
    channel.sent = [];
    channel.failNext = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('procesar dos veces el mismo job envía una sola vez', async () => {
    const sender = app.get(NotificationSender);
    await expect(sender.handle(job())).resolves.toBe('sent');
    await expect(sender.handle(job())).resolves.toBe('skipped');
    expect(channel.sent).toHaveLength(1);
    expect(await logCount()).toBe(1);
  });

  it('si el envío falla libera la huella y el reintento envía', async () => {
    const sender = app.get(NotificationSender);
    channel.failNext = 1;
    await expect(sender.handle(job())).rejects.toThrow('Proveedor caído');
    expect(await logCount()).toBe(0);
    await expect(sender.handle(job())).resolves.toBe('sent');
    expect(channel.sent).toHaveLength(1);
    expect(await logCount()).toBe(1);
  });

  it('encolar dos veces la misma key deja un solo job', async () => {
    const notifications = app.get(NotificationsService);
    await notifications.enqueue(job('order-created-dup'));
    await notifications.enqueue(job('order-created-dup'));
    const queue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
    expect(await queue.getJob('order-created-dup')).toBeDefined();
    expect(await queue.getJobCountByTypes('waiting')).toBe(1);
  });

  it('enmascara el correo en el canal de log', () => {
    expect(maskEmail('juan@correo.pe')).toBe('j***@correo.pe');
    expect(maskEmail('sin-arroba')).toBe('***');
  });
});
```

- [ ] **Step 5: Ejecutar las pruebas**

Run: `npm run test:e2e -- notifications`
Expected: PASS (4 pruebas). Si `getJobCountByTypes` no existe en `bullmq@6`, usar `(await queue.getJobCounts('waiting')).waiting`.

- [ ] **Step 6: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add src/notifications test
git commit -m "Backend: cola de notificaciones idempotente con canal de log

jobId igual a la llave del mensaje y huella única en notification_logs:
reintentos de BullMQ no duplican envíos; si el envío falla se libera la
huella. Canal de log con destinatario enmascarado."
```

---

### Task 8: Pedidos — reserva de carrito con `SKIP LOCKED`, consulta y cancelación

**Files:**
- Create: `backend/src/settings/settings.service.ts`, `backend/src/settings/settings.module.ts`
- Create: `backend/src/orders/orders.constants.ts`, `backend/src/orders/dto/create-order.dto.ts`, `backend/src/orders/dto/order-response.dto.ts`
- Create: `backend/src/orders/orders-queue.service.ts`, `backend/src/orders/orders.service.ts`, `backend/src/orders/orders.controller.ts`, `backend/src/orders/orders.module.ts`
- Modify: `backend/src/app.module.ts` (agregar `OrdersModule`)
- Test: `backend/test/orders.e2e-spec.ts`, `backend/test/concurrency.e2e-spec.ts`

**Interfaces:**
- Consumes: `Order`, `OrderItem`, `LicenseItem`, `Setting`, `OrderStatus`, `LicenseStatus`, `CURRENCIES`, `Currency` (Tarea 2); `fn_release_order` (Tarea 3); `AuditService` (Tarea 4); `CurrentUser`, `AuthenticatedUser`, `UsersService`, `UsersModule`, `JwtService` (Tarea 6); `NotificationsService`, `NotificationsModule` (Tarea 7); factories y `createTestApp`/`resetState`.
- Produces: `SettingsService.getNumber(key: string, fallback: number): Promise<number>`; `SETTING_RESERVATION_TTL_MINUTES = 'reservationTtlMinutes'`; constantes `QUEUE_ORDERS`, `JOB_RELEASE`, `JOB_SWEEP`, `SWEEP_EVERY_MS`, `RELEASE_DELAY_MARGIN_MS`, `DEFAULT_RESERVATION_TTL_MINUTES`, `releaseJobId(orderId: string): string`, `orderCreatedKey(orderId: string): string`; `OrdersQueueService.scheduleRelease(orderId: string, delayMs: number): Promise<void>`; `OrdersService.create(user, dto)`, `findForUser(userId, id)`, `cancel(user, id)` → `Promise<OrderResponseDto>`; `OrdersModule` (exporta `BullModule` con la cola `orders`).

- [ ] **Step 1: Settings**

`src/settings/settings.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../database/entities';

export const SETTING_RESERVATION_TTL_MINUTES = 'reservationTtlMinutes';

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(Setting) private readonly settings: Repository<Setting>) {}

  /** Lee un número de settings; si falta o no es número, devuelve `fallback`. */
  async getNumber(key: string, fallback: number): Promise<number> {
    const row = await this.settings.findOne({ where: { key } });
    return typeof row?.value === 'number' && Number.isFinite(row.value) ? row.value : fallback;
  }
}
```

`src/settings/settings.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from '../database/entities';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Setting])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 2: Constantes, DTOs y cola**

`src/orders/orders.constants.ts`:

```ts
export const QUEUE_ORDERS = 'orders';
export const JOB_RELEASE = 'release';
export const JOB_SWEEP = 'sweep-expired';

/** Red de seguridad: libera reservas vencidas aunque Redis haya perdido algún job. */
export const SWEEP_EVERY_MS = 5 * 60_000;
/** El job de liberación corre un poco después del vencimiento para no llegar antes de tiempo. */
export const RELEASE_DELAY_MARGIN_MS = 2_000;
export const DEFAULT_RESERVATION_TTL_MINUTES = 30;

export const releaseJobId = (orderId: string): string => `release-${orderId}`;
export const orderCreatedKey = (orderId: string): string => `order-created-${orderId}`;
```

`src/orders/dto/create-order.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class CreateOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'planId debe ser un UUID' })
  planId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad mínima es 1' })
  @Max(5, { message: 'La cantidad máxima por plan es 5' })
  qty!: number;
}

export class CreateOrderDto {
  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES, { message: 'La moneda debe ser PEN o USD' })
  currency!: Currency;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray({ message: 'items debe ser una lista' })
  @ArrayMinSize(1, { message: 'El carrito está vacío' })
  @ArrayMaxSize(10, { message: 'El carrito admite hasta 10 planes distintos' })
  @ArrayUnique((item: CreateOrderItemDto) => item.planId, { message: 'No repitas un plan en el carrito' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional({ description: 'Usuario en la herramienta, si el producto lo requiere (D14)' })
  @IsOptional()
  @IsString({ message: 'toolUsername debe ser texto' })
  @Length(1, 120, { message: 'toolUsername admite hasta 120 caracteres' })
  toolUsername?: string;
}
```

`src/orders/dto/order-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { Order, OrderItem } from '../../database/entities';
import { OrderStatus } from '../../database/enums';

export class OrderItemResponseDto {
  @ApiProperty() planId!: string;
  @ApiProperty() unitPriceCents!: number;
}

export class OrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: number;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() totalCents!: number;
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ type: String, nullable: true }) cancelReason!: string | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];

  static from(order: Order, items: OrderItem[]): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      currency: order.currency,
      expiresAt: order.expiresAt,
      cancelReason: order.cancelReason,
      items: [...items]
        .sort((a, b) => a.planId.localeCompare(b.planId))
        .map((item) => ({ planId: item.planId, unitPriceCents: item.unitPriceCents })),
    };
  }
}
```

`src/orders/orders-queue.service.ts`:

```ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_RELEASE, QUEUE_ORDERS, RELEASE_DELAY_MARGIN_MS, releaseJobId } from './orders.constants';

@Injectable()
export class OrdersQueueService {
  constructor(@InjectQueue(QUEUE_ORDERS) private readonly queue: Queue) {}

  async scheduleRelease(orderId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      JOB_RELEASE,
      { orderId },
      { jobId: releaseJobId(orderId), delay: delayMs + RELEASE_DELAY_MARGIN_MS },
    );
  }
}
```

- [ ] **Step 3: Escribir las pruebas e2e que fallan** — `test/orders.e2e-spec.ts`

```ts
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

  const tokenFor = (user: User) => app.get(JwtService).sign({ sub: user.id, role: user.role });
  const postOrder = (user: User, body: object) =>
    request(app.getHttpServer()).post('/orders').set('Authorization', `Bearer ${tokenFor(user)}`).send(body);
  const getOrder = (user: User, id: string) =>
    request(app.getHttpServer()).get(`/orders/${id}`).set('Authorization', `Bearer ${tokenFor(user)}`);
  const cancelOrder = (user: User, id: string) =>
    request(app.getHttpServer()).post(`/orders/${id}/cancel`).set('Authorization', `Bearer ${tokenFor(user)}`);
  const countLicenses = async (status: string) => {
    const [{ count }]: { count: string }[] = await ds.query(`SELECT count(*) FROM license_items WHERE status = $1`, [
      status,
    ]);
    return Number(count);
  };
  const countAudit = async (action: string) => {
    const [{ count }]: { count: string }[] = await ds.query(`SELECT count(*) FROM audit_logs WHERE action = $1`, [
      action,
    ]);
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

    expect(res.body).toMatchObject({ status: 'PENDING_PAYMENT', currency: 'PEN', totalCents: 4500, orderNumber: 1001 });
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
    const [{ count }]: { count: string }[] = await ds.query(`SELECT count(*) FROM orders`);
    expect(Number(count)).toBe(0);
  });

  it('congela el precio aunque cambie después', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, { prices: { PEN: 1000 } });
    const created = await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(201);

    await ds.query(`UPDATE plan_prices SET "priceCents" = 9999 WHERE "planId" = $1`, [plan.id]);

    const res = await getOrder(user, created.body.id as string).expect(200);
    expect(res.body.items[0].unitPriceCents).toBe(1000);
    expect(res.body.totalCents).toBe(1000);
  });

  it('cobra el precio de la moneda elegida', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, { stock: 2, prices: { PEN: 1000, USD: 300 } });

    const pen = await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(201);
    const usd = await postOrder(user, { currency: 'USD', items: [{ planId: plan.id, qty: 1 }] }).expect(201);

    expect(pen.body).toMatchObject({ currency: 'PEN', totalCents: 1000 });
    expect(usd.body).toMatchObject({ currency: 'USD', totalCents: 300 });
  });

  it('responde 409 si un plan no tiene precio en la moneda elegida', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, { prices: { PEN: 1000 }, planName: 'Plan solo soles' });
    const res = await postOrder(user, { currency: 'USD', items: [{ planId: plan.id, qty: 1 }] }).expect(409);
    expect(res.body.message).toBe('Plan solo soles no está disponible en USD');
  });

  it('responde 400 con una moneda no permitida', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await postOrder(user, { currency: 'EUR', items: [{ planId: plan.id, qty: 1 }] }).expect(400);
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
    const { plan } = await createCatalog(ds, { requiresToolUsername: true, planName: 'Plan con cuenta' });
    const res = await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(400);
    expect(res.body.message).toBe('Plan con cuenta requiere tu usuario de la herramienta');
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
    await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(404);
  });

  it('responde 401 sin sesión', async () => {
    await request(app.getHttpServer()).post('/orders').send({}).expect(401);
  });

  it('un cliente no ve pedidos ajenos (IDOR)', async () => {
    const alice = await createUser(ds);
    const bob = await createUser(ds);
    const { plan } = await createCatalog(ds);
    const created = await postOrder(alice, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(201);

    await getOrder(alice, created.body.id as string).expect(200);
    const res = await getOrder(bob, created.body.id as string).expect(404);
    expect(res.body.message).toBe('Pedido no encontrado');
  });

  it('audita la creación del pedido', async () => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds);
    await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(201);
    const [row]: { meta: { totalCents: number; currency: string } }[] = await ds.query(
      `SELECT meta FROM audit_logs WHERE action = 'order.created'`,
    );
    expect(row.meta).toMatchObject({ totalCents: 1000, currency: 'PEN' });
  });

  describe('cancelar', () => {
    it('libera las licencias reservadas', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds, { stock: 2 });
      const created = await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 2 }] }).expect(201);

      const res = await cancelOrder(user, created.body.id as string).expect(200);

      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'CUSTOMER_CANCELLED' });
      expect(await countLicenses('AVAILABLE')).toBe(2);
      expect(await countAudit('order.cancelled')).toBe(1);
    });

    it('es idempotente', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const created = await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(201);

      await cancelOrder(user, created.body.id as string).expect(200);
      await cancelOrder(user, created.body.id as string).expect(200);
      expect(await countAudit('order.cancelled')).toBe(1);
    });

    it('responde 409 si el pedido está en revisión', async () => {
      const user = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const created = await postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(201);
      await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [created.body.id]);

      const res = await cancelOrder(user, created.body.id as string).expect(409);
      expect(res.body.message).toBe('Solo puedes cancelar un pedido pendiente de pago');
      expect(await countLicenses('RESERVED')).toBe(1);
    });

    it('un cliente no puede cancelar el pedido de otro', async () => {
      const alice = await createUser(ds);
      const bob = await createUser(ds);
      const { plan } = await createCatalog(ds);
      const created = await postOrder(alice, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] }).expect(201);
      await cancelOrder(bob, created.body.id as string).expect(404);
    });
  });
});
```

`test/concurrency.e2e-spec.ts`:

```ts
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../src/database/entities';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Concurrencia de reservas (regla 1)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

  const postOrder = (user: User, body: object) =>
    request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${app.get(JwtService).sign({ sub: user.id, role: user.role })}`)
      .send(body);

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

  it('20 compras simultáneas contra 5 licencias: 5 aceptadas, 15 sin stock, ninguna licencia repetida', async () => {
    const { plan } = await createCatalog(ds, { stock: 5 });
    const users = await Promise.all(Array.from({ length: 20 }, () => createUser(ds)));

    const responses = await Promise.all(
      users.map((user) => postOrder(user, { currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] })),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(15);

    const [row]: { reserved: string; distinctItems: string }[] = await ds.query(
      `SELECT count(*) AS reserved, count(DISTINCT "orderItemId") AS "distinctItems"
         FROM license_items WHERE status = 'RESERVED'`,
    );
    expect(Number(row.reserved)).toBe(5);
    expect(Number(row.distinctItems)).toBe(5);
  });

  it('carritos cruzados (A,B) y (B,A) terminan sin deadlock', async () => {
    const a = await createCatalog(ds, { stock: 10 });
    const b = await createCatalog(ds, { stock: 10 });
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser(ds)));

    const responses = await Promise.all(
      users.map((user, i) => {
        const items =
          i % 2 === 0
            ? [
                { planId: a.plan.id, qty: 1 },
                { planId: b.plan.id, qty: 1 },
              ]
            : [
                { planId: b.plan.id, qty: 1 },
                { planId: a.plan.id, qty: 1 },
              ];
        return postOrder(user, { currency: 'PEN', items });
      }),
    );

    expect(responses.every((r) => r.status === 201)).toBe(true);
    const [{ count }]: { count: string }[] = await ds.query(
      `SELECT count(*) FROM license_items WHERE status = 'RESERVED'`,
    );
    expect(Number(count)).toBe(20);
  });
});
```

- [ ] **Step 4: Ejecutar y verificar que fallan**

Run: `npm run test:e2e -- orders concurrency`
Expected: FAIL con `404` en `POST /orders` (la ruta aún no existe).

- [ ] **Step 5: Implementar el servicio** — `src/orders/orders.service.ts`

```ts
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { LicenseItem, Order, OrderItem } from '../database/entities';
import { LicenseStatus, OrderStatus } from '../database/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { SETTING_RESERVATION_TTL_MINUTES, SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersQueueService } from './orders-queue.service';
import { DEFAULT_RESERVATION_TTL_MINUTES, orderCreatedKey } from './orders.constants';

interface PlanRow {
  id: string;
  name: string;
  active: boolean;
  requiresToolUsername: boolean;
  priceCents: number | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly queue: OrdersQueueService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Reserva todo el carrito en una transacción (RF-COM-01/02, D30, D61).
   * `FOR UPDATE SKIP LOCKED` hace que compradores simultáneos tomen licencias distintas (regla 1);
   * ordenar por planId fija el orden de bloqueo y evita deadlocks entre carritos cruzados.
   */
  async create(user: AuthenticatedUser, dto: CreateOrderDto): Promise<OrderResponseDto> {
    const ttlMinutes = await this.settings.getNumber(SETTING_RESERVATION_TTL_MINUTES, DEFAULT_RESERVATION_TTL_MINUTES);
    const items = [...dto.items].sort((a, b) => a.planId.localeCompare(b.planId));

    const { order, orderItems } = await this.ds.transaction(async (m) => {
      const plans: PlanRow[] = await m.query(
        `SELECT p.id, p.name, (p.active AND pr.active) AS active, pr."requiresToolUsername", pp."priceCents"
           FROM plans p
           JOIN products pr ON pr.id = p."productId"
           LEFT JOIN plan_prices pp ON pp."planId" = p.id AND pp.currency = $2
          WHERE p.id = ANY($1::uuid[])`,
        [items.map((item) => item.planId), dto.currency],
      );
      const planById = new Map(plans.map((plan) => [plan.id, plan]));

      for (const item of items) {
        const plan = planById.get(item.planId);
        if (!plan || !plan.active) {
          throw new NotFoundException('Uno de los planes no existe o no está disponible');
        }
        if (plan.priceCents === null) {
          throw new ConflictException(`${plan.name} no está disponible en ${dto.currency}`);
        }
        if (plan.requiresToolUsername && !dto.toolUsername) {
          throw new BadRequestException(`${plan.name} requiere tu usuario de la herramienta`);
        }
      }

      const reservedByPlan = new Map<string, string[]>();
      for (const item of items) {
        const rows: { id: string }[] = await m.query(
          `SELECT id FROM license_items
            WHERE "planId" = $1 AND status = 'AVAILABLE'
            ORDER BY "createdAt"
            LIMIT $2
            FOR UPDATE SKIP LOCKED`,
          [item.planId, item.qty],
        );
        if (rows.length < item.qty) {
          throw new ConflictException(`Sin stock suficiente de ${planById.get(item.planId)!.name}`);
        }
        reservedByPlan.set(
          item.planId,
          rows.map((row) => row.id),
        );
      }

      const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
      const totalCents = items.reduce((sum, item) => sum + planById.get(item.planId)!.priceCents! * item.qty, 0);
      const order = await m.save(
        Order,
        m.create(Order, {
          userId: user.id,
          status: OrderStatus.PENDING_PAYMENT,
          totalCents,
          currency: dto.currency,
          toolUsername: dto.toolUsername ?? null,
          expiresAt,
          cancelReason: null,
        }),
      );

      const orderItems: OrderItem[] = [];
      for (const item of items) {
        const unitPriceCents = planById.get(item.planId)!.priceCents!;
        for (const licenseId of reservedByPlan.get(item.planId)!) {
          const orderItem = await m.save(
            OrderItem,
            m.create(OrderItem, { orderId: order.id, planId: item.planId, unitPriceCents }),
          );
          await m.update(
            LicenseItem,
            { id: licenseId },
            { status: LicenseStatus.RESERVED, orderItemId: orderItem.id, reservedUntil: expiresAt },
          );
          orderItems.push(orderItem);
        }
      }

      await this.audit.log(m, {
        actorId: user.id,
        action: 'order.created',
        entity: 'order',
        entityId: order.id,
        meta: { items: dto.items, totalCents, currency: dto.currency },
      });
      return { order, orderItems };
    });

    await this.afterCreate(order, user.id, ttlMinutes);
    return OrderResponseDto.from(order, orderItems);
  }

  async findForUser(userId: string, orderId: string): Promise<OrderResponseDto> {
    const order = await this.findOwned(userId, orderId);
    return OrderResponseDto.from(order, order.items ?? []);
  }

  /** Solo PENDING_PAYMENT; repetirlo sobre un pedido ya cancelado responde 200 sin cambios. */
  async cancel(user: AuthenticatedUser, orderId: string): Promise<OrderResponseDto> {
    const current = await this.findOwned(user.id, orderId);
    if (current.status === OrderStatus.CANCELLED) {
      return OrderResponseDto.from(current, current.items ?? []);
    }

    const released = await this.ds.transaction(async (m) => {
      const [{ released }]: { released: boolean }[] = await m.query(
        `SELECT fn_release_order($1, 'CUSTOMER_CANCELLED', false) AS released`,
        [orderId],
      );
      if (released) {
        await this.audit.log(m, { actorId: user.id, action: 'order.cancelled', entity: 'order', entityId: orderId });
      }
      return released;
    });

    const fresh = await this.findOwned(user.id, orderId);
    if (!released && fresh.status !== OrderStatus.CANCELLED) {
      throw new ConflictException('Solo puedes cancelar un pedido pendiente de pago');
    }
    return OrderResponseDto.from(fresh, fresh.items ?? []);
  }

  /** Un pedido ajeno responde 404, igual que uno inexistente (regla 7). */
  private async findOwned(userId: string, orderId: string): Promise<Order> {
    const order = await this.ds.getRepository(Order).findOne({
      where: { id: orderId, userId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  /**
   * Fuera de la transacción: si Redis falla, el pedido ya existe y el barrido
   * (sweep-expired) lo libera igual. Por eso no se devuelve error al cliente.
   */
  private async afterCreate(order: Order, userId: string, ttlMinutes: number): Promise<void> {
    try {
      await this.queue.scheduleRelease(order.id, ttlMinutes * 60_000);
      const owner = await this.users.findById(userId);
      if (owner) {
        await this.notifications.enqueue({
          key: orderCreatedKey(order.id),
          template: 'order-created',
          recipient: owner.email,
          data: { orderNumber: order.orderNumber },
        });
      }
    } catch (error) {
      this.logger.warn({ err: error, orderId: order.id }, 'No se pudo encolar la liberación o la notificación');
    }
  }
}
```

- [ ] **Step 6: Controller, módulo y registro en AppModule**

`src/orders/orders.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
    return this.orders.create(user, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OrderResponseDto> {
    return this.orders.findForUser(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OrderResponseDto> {
    return this.orders.cancel(user, id);
  }
}
```

`src/orders/orders.module.ts`:

```ts
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { OrdersQueueService } from './orders-queue.service';
import { QUEUE_ORDERS } from './orders.constants';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_ORDERS }), NotificationsModule, SettingsModule, UsersModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersQueueService],
  exports: [BullModule],
})
export class OrdersModule {}
```

En `src/app.module.ts`, agregar el import y el módulo al final de `imports`:

```ts
import { OrdersModule } from './orders/orders.module';
```

```ts
    HealthModule,
    AuthModule,
    OrdersModule,
  ],
```

- [ ] **Step 7: Ejecutar y verificar que pasan**

Run: `npm run test:e2e -- orders concurrency`
Expected: PASS (16 + 2 pruebas).
Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add src test
git commit -m "Backend: pedidos con carrito, reserva SKIP LOCKED y cancelación

POST /orders reserva todas las unidades en una transacción (rechazo
completo si falta stock), precio congelado en la moneda elegida, GET
con verificación de propiedad y cancelación idempotente vía
fn_release_order. Pruebas de concurrencia: 20 compras contra 5 claves."
```

---

### Task 9: Liberación por cola, barrido periódico y proceso worker

**Files:**
- Create: `backend/src/orders/order-release.service.ts`, `backend/src/orders/orders.processor.ts`, `backend/src/orders/orders-worker.module.ts`
- Modify: `backend/src/orders/orders.module.ts` (proveer y exportar `OrderReleaseService`)
- Create: `backend/src/workers.module.ts`, `backend/src/worker.module.ts`, `backend/src/worker.ts`
- Modify: `backend/src/app.module.ts` (importar `WorkersModule` si `APP_ROLE=all`)
- Test: `backend/test/release.e2e-spec.ts`

**Interfaces:**
- Consumes: `fn_release_order`, `fn_release_expired` (Tarea 3); `AuditService`; `QUEUE_ORDERS`, `JOB_RELEASE`, `JOB_SWEEP`, `SWEEP_EVERY_MS`, `releaseJobId`, `orderCreatedKey` (Tarea 8); `NotificationsWorkerModule`, `QUEUE_NOTIFICATIONS` (Tarea 7).
- Produces: `OrderReleaseService.releaseIfExpired(orderId: string): Promise<boolean>`, `OrderReleaseService.sweepExpired(): Promise<string[]>`; `OrdersProcessor` (procesa `release` y `sweep-expired`, registra el scheduler al arrancar); `WorkersModule`; `WorkerModule`; entrypoint `dist/worker.js`.

- [ ] **Step 1: Escribir las pruebas que fallan** — `test/release.e2e-spec.ts`

```ts
import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Job, Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { QUEUE_NOTIFICATIONS } from '../src/notifications/notification.types';
import { OrderReleaseService } from '../src/orders/order-release.service';
import { JOB_RELEASE, JOB_SWEEP, orderCreatedKey, QUEUE_ORDERS, releaseJobId } from '../src/orders/orders.constants';
import { OrdersProcessor } from '../src/orders/orders.processor';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('Liberación de reservas', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  let release: OrderReleaseService;
  let ordersQueue: Queue;

  const createOrder = async (): Promise<string> => {
    const user = await createUser(ds);
    const { plan } = await createCatalog(ds, { stock: 1 });
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${app.get(JwtService).sign({ sub: user.id, role: user.role })}`)
      .send({ currency: 'PEN', items: [{ planId: plan.id, qty: 1 }] })
      .expect(201);
    return res.body.id as string;
  };
  const expire = (orderId: string) =>
    ds.query(`UPDATE orders SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [orderId]);
  const orderStatus = async (orderId: string) => {
    const [row]: { status: string; cancelReason: string | null }[] = await ds.query(
      `SELECT status, "cancelReason" FROM orders WHERE id = $1`,
      [orderId],
    );
    return row;
  };
  const count = async (sql: string) => {
    const [{ count }]: { count: string }[] = await ds.query(sql);
    return Number(count);
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    release = app.get(OrderReleaseService);
    ordersQueue = app.get<Queue>(getQueueToken(QUEUE_ORDERS));
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('crear un pedido programa la liberación y la notificación', async () => {
    const orderId = await createOrder();
    const job = await ordersQueue.getJob(releaseJobId(orderId));
    expect(job?.name).toBe(JOB_RELEASE);
    expect(job?.opts.delay).toBeGreaterThanOrEqual(30 * 60_000);
    const notifications = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
    expect(await notifications.getJob(orderCreatedKey(orderId))).toBeDefined();
  });

  it('el job libera un pedido vencido y lo audita', async () => {
    const orderId = await createOrder();
    await expire(orderId);

    await expect(release.releaseIfExpired(orderId)).resolves.toBe(true);

    expect(await orderStatus(orderId)).toEqual({ status: 'CANCELLED', cancelReason: 'EXPIRED' });
    expect(await count(`SELECT count(*) FROM license_items WHERE status = 'AVAILABLE'`)).toBe(1);
    expect(await count(`SELECT count(*) FROM audit_logs WHERE action = 'order.expired'`)).toBe(1);
  });

  it('el job no libera un pedido que aún no vence', async () => {
    const orderId = await createOrder();
    await expect(release.releaseIfExpired(orderId)).resolves.toBe(false);
    expect((await orderStatus(orderId)).status).toBe('PENDING_PAYMENT');
  });

  it('el job nunca libera un pedido IN_REVIEW (regla 3)', async () => {
    const orderId = await createOrder();
    await ds.query(`UPDATE orders SET status = 'IN_REVIEW' WHERE id = $1`, [orderId]);
    await expire(orderId);

    await expect(release.releaseIfExpired(orderId)).resolves.toBe(false);
    expect(await count(`SELECT count(*) FROM license_items WHERE status = 'RESERVED'`)).toBe(1);
  });

  it('el barrido libera un pedido cuyo job se perdió', async () => {
    const orderId = await createOrder();
    await ordersQueue.obliterate({ force: true });
    await expire(orderId);

    await expect(release.sweepExpired()).resolves.toEqual([orderId]);
    expect((await orderStatus(orderId)).status).toBe('CANCELLED');
  });

  it('job y barrido en paralelo liberan una sola vez', async () => {
    const orderId = await createOrder();
    await expire(orderId);

    await Promise.all([release.releaseIfExpired(orderId), release.sweepExpired()]);

    expect((await orderStatus(orderId)).status).toBe('CANCELLED');
    expect(await count(`SELECT count(*) FROM audit_logs WHERE action = 'order.expired'`)).toBe(1);
  });

  it('el processor enruta los jobs y registra el barrido periódico', async () => {
    const processor = new OrdersProcessor(release, ordersQueue);
    const orderId = await createOrder();
    await expire(orderId);

    await expect(processor.process({ name: JOB_RELEASE, data: { orderId } } as Job)).resolves.toBe(true);
    await expect(processor.process({ name: 'desconocido', data: {} } as Job)).rejects.toThrow(
      'Job desconocido: desconocido',
    );

    await processor.onApplicationBootstrap();
    const schedulers = await ordersQueue.getJobSchedulers();
    expect(schedulers.map((s) => s.key)).toContain(JOB_SWEEP);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:e2e -- release`
Expected: FAIL con `Cannot find module '../src/orders/order-release.service'`.

- [ ] **Step 3: Implementar la liberación** — `src/orders/order-release.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';

/**
 * Libera reservas vencidas. Toda la lógica de estado vive en fn_release_order (Postgres manda, regla 2):
 * bloquea el pedido y solo actúa si sigue PENDING_PAYMENT y vencido, así que es idempotente.
 */
@Injectable()
export class OrderReleaseService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Job `release-<orderId>`. Devuelve true solo si esta llamada liberó el pedido. */
  releaseIfExpired(orderId: string): Promise<boolean> {
    return this.ds.transaction(async (m) => {
      const [{ released }]: { released: boolean }[] = await m.query(
        `SELECT fn_release_order($1, 'EXPIRED', true) AS released`,
        [orderId],
      );
      if (released) {
        await this.audit.log(m, { actorId: null, action: 'order.expired', entity: 'order', entityId: orderId });
      }
      return released;
    });
  }

  /** Barrido periódico: red de seguridad por si Redis perdió algún job. */
  sweepExpired(): Promise<string[]> {
    return this.ds.transaction(async (m) => {
      const rows: { id: string }[] = await m.query(`SELECT fn_release_expired() AS id`);
      for (const { id } of rows) {
        await this.audit.log(m, {
          actorId: null,
          action: 'order.expired',
          entity: 'order',
          entityId: id,
          meta: { via: 'sweep' },
        });
      }
      return rows.map((row) => row.id);
    });
  }
}
```

En `src/orders/orders.module.ts`, agregar `OrderReleaseService` a `providers` y a `exports`:

```ts
import { OrderReleaseService } from './order-release.service';
```

```ts
  providers: [OrdersService, OrdersQueueService, OrderReleaseService],
  exports: [BullModule, OrderReleaseService],
```

- [ ] **Step 4: Processor y módulos de worker**

`src/orders/orders.processor.ts`:

```ts
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { OrderReleaseService } from './order-release.service';
import { JOB_RELEASE, JOB_SWEEP, QUEUE_ORDERS, SWEEP_EVERY_MS } from './orders.constants';

@Processor(QUEUE_ORDERS)
export class OrdersProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly release: OrderReleaseService,
    @InjectQueue(QUEUE_ORDERS) private readonly queue: Queue,
  ) {
    super();
  }

  /** Registra (o actualiza) el barrido cada 5 min. upsert evita duplicarlo entre reinicios. */
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(JOB_SWEEP, { every: SWEEP_EVERY_MS }, { name: JOB_SWEEP });
  }

  async process(job: Job<{ orderId?: string }>): Promise<boolean | string[]> {
    switch (job.name) {
      case JOB_RELEASE:
        return this.release.releaseIfExpired(job.data.orderId!);
      case JOB_SWEEP:
        return this.release.sweepExpired();
      default:
        throw new Error(`Job desconocido: ${job.name}`);
    }
  }
}
```

`src/orders/orders-worker.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { OrdersModule } from './orders.module';
import { OrdersProcessor } from './orders.processor';

@Module({
  imports: [OrdersModule],
  providers: [OrdersProcessor],
})
export class OrdersWorkerModule {}
```

`src/workers.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsWorkerModule } from './notifications/notifications-worker.module';
import { OrdersWorkerModule } from './orders/orders-worker.module';

/** Todos los processors de BullMQ. */
@Module({
  imports: [OrdersWorkerModule, NotificationsWorkerModule],
})
export class WorkersModule {}
```

`src/worker.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { WorkersModule } from './workers.module';

/** Proceso worker: infraestructura + processors, sin HTTP. */
@Module({
  imports: [CoreModule, WorkersModule],
})
export class WorkerModule {}
```

`src/worker.ts`:

```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // Cierra workers y conexiones al recibir SIGTERM (despliegues en Fly.io).
  app.enableShutdownHooks();
  app.get(Logger).log('Worker iniciado');
}

void bootstrap();
```

En `src/app.module.ts`, agregar la función y el import condicional (antes del decorador `@Module`):

```ts
import { WorkersModule } from './workers.module';

/**
 * Se evalúa al cargar el módulo; main.ts carga .env antes (import 'dotenv/config').
 * En desarrollo (`all`) los processors corren dentro de la API; en producción, en su propio proceso.
 */
function runWorkersInApi(): boolean {
  const role = process.env.APP_ROLE ?? (process.env.NODE_ENV === 'production' ? 'api' : 'all');
  return role === 'all';
}
```

y al final de `imports`:

```ts
    OrdersModule,
    ...(runWorkersInApi() ? [WorkersModule] : []),
  ],
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `npm run test:e2e -- release`
Expected: PASS (7 pruebas). Si `getJobSchedulers` devuelve objetos sin `key`, inspeccionar el objeto y comparar por el campo de id equivalente; anotarlo en el informe.

- [ ] **Step 6: Verificar los dos procesos**

```bash
npm run build
ls dist/main.js dist/worker.js
APP_ROLE=worker timeout 10 node dist/worker.js; echo "exit=$?"
```

Expected: ambos archivos existen; el worker imprime `Worker iniciado` y termina por `timeout` con `exit=124` (sin trazas de error antes).

Luego, con `npm run start:dev` (APP_ROLE=all en `.env`), crear un pedido por Swagger (`/docs`) o `curl` y confirmar en los logs que el job `order-created` se procesa (`Notificación enviada (canal de log)`).

- [ ] **Step 7: Suite completa y commit**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: todo en verde.

```bash
git add src test
git commit -m "Backend: liberación de reservas por job y barrido, y proceso worker

Job release-<id> y barrido cada 5 min sobre fn_release_order /
fn_release_expired (idempotentes, auditados una sola vez). Entrypoint
dist/worker.js con los processors; en desarrollo corren dentro de la API."
```

---

### Task 10: Seed idempotente

**Files:**
- Create: `backend/src/database/seed.ts`
- Test: `backend/test/seed.e2e-spec.ts`

**Interfaces:**
- Consumes: `CryptoService` (Tarea 4), `validateEnv` (Tarea 1), `buildDataSourceOptions` (Tarea 2), `truncateAll` (Tarea 3).
- Produces: `interface SeedEnv { ADMIN_EMAIL: string; ADMIN_PASSWORD: string; LICENSE_ENC_KEY: string }`; `runSeed(ds: DataSource, env: SeedEnv): Promise<void>`; script `npm run seed`.

- [ ] **Step 1: Escribir la prueba que falla** — `test/seed.e2e-spec.ts`

```ts
import { DataSource } from 'typeorm';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { runSeed } from '../src/database/seed';
import { TEST_DATABASE_URL } from './setup-env';
import { truncateAll } from './utils/factories';

describe('Seed', () => {
  let ds: DataSource;
  const env = {
    ADMIN_EMAIL: 'Admin@FreeCell.local',
    ADMIN_PASSWORD: 'admin-password-123',
    LICENSE_ENC_KEY: process.env.LICENSE_ENC_KEY!,
  };
  const count = async (sql: string) => {
    const [{ count }]: { count: string }[] = await ds.query(sql);
    return Number(count);
  };

  beforeAll(async () => {
    ds = await new DataSource(buildDataSourceOptions({ DATABASE_URL: TEST_DATABASE_URL, DB_SSL: false })).initialize();
    await truncateAll(ds);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('es idempotente: correrlo dos veces deja los mismos datos', async () => {
    await runSeed(ds, env);
    await runSeed(ds, env);

    expect(await count(`SELECT count(*) FROM users WHERE role = 'ADMIN' AND email = 'admin@freecell.local'`)).toBe(1);
    expect(await count(`SELECT count(*) FROM plans`)).toBe(2);
    expect(await count(`SELECT count(*) FROM plan_prices`)).toBe(3);
    expect(await count(`SELECT count(*) FROM license_batches`)).toBe(1);
    expect(await count(`SELECT count(*) FROM license_items WHERE status = 'AVAILABLE'`)).toBe(5);
    expect(await count(`SELECT count(*) FROM payment_methods`)).toBe(5);
    expect(await count(`SELECT count(*) FROM settings WHERE key = 'reservationTtlMinutes'`)).toBe(1);
  });

  it('guarda las licencias cifradas y descifrables con LICENSE_ENC_KEY', async () => {
    const crypto = new CryptoService(env.LICENSE_ENC_KEY);
    const rows: { secretEncrypted: string }[] = await ds.query(
      `SELECT "secretEncrypted" FROM license_items ORDER BY "createdAt"`,
    );
    expect(rows[0].secretEncrypted).not.toContain('DEMO-');
    expect(rows.map((r) => crypto.decrypt(r.secretEncrypted)).sort()).toEqual([
      'DEMO-0001',
      'DEMO-0002',
      'DEMO-0003',
      'DEMO-0004',
      'DEMO-0005',
    ]);
  });

  it('el único método CRYPTO acepta solo USD', async () => {
    const rows: { code: string; currencies: string }[] = await ds.query(
      `SELECT code, currencies::text FROM payment_methods WHERE kind = 'CRYPTO'`,
    );
    expect(rows).toEqual([{ code: 'binance-pay', currencies: '{USD}' }]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:e2e -- seed`
Expected: FAIL con `Cannot find module '../src/database/seed'`.

- [ ] **Step 3: Implementar** — `src/database/seed.ts`

```ts
import 'dotenv/config';
import { hash } from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { CryptoService } from '../common/crypto/crypto.service';
import { validateEnv } from '../core/config/env.validation';
import { buildDataSourceOptions } from './data-source-options';

export interface SeedEnv {
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  LICENSE_ENC_KEY: string;
}

/** Datos de desarrollo. Nombres, precios y datos de cobro son placeholders: no son datos de negocio reales. */
const PAYMENT_METHODS = [
  { code: 'yape', name: 'Yape', kind: 'WALLET', currencies: ['PEN'], instructions: { phone: '[número Yape]', holder: '[titular]' } },
  { code: 'plin', name: 'Plin', kind: 'WALLET', currencies: ['PEN'], instructions: { phone: '[número Plin]', holder: '[titular]' } },
  {
    code: 'transfer-pen',
    name: 'Transferencia en soles',
    kind: 'BANK_TRANSFER',
    currencies: ['PEN'],
    instructions: { bank: '[banco]', account: '[cuenta]', cci: '[CCI]', holder: '[titular]' },
  },
  {
    code: 'transfer-usd',
    name: 'Transferencia en dólares',
    kind: 'BANK_TRANSFER',
    currencies: ['USD'],
    instructions: { bank: '[banco]', account: '[cuenta]', cci: '[CCI]', holder: '[titular]' },
  },
  {
    code: 'binance-pay',
    name: 'Binance Pay (USDT)',
    kind: 'CRYPTO',
    currencies: ['USD'],
    instructions: { payId: '[Binance Pay ID]', holder: '[titular]', asset: 'USDT' },
  },
];

async function upsertPlan(
  m: EntityManager,
  productId: string,
  name: string,
  prices: Record<string, number>,
): Promise<string> {
  let [plan]: { id: string }[] = await m.query(`SELECT id FROM plans WHERE "productId" = $1 AND name = $2`, [
    productId,
    name,
  ]);
  if (!plan) {
    [plan] = await m.query(`INSERT INTO plans ("productId", name, "durationDays") VALUES ($1, $2, 30) RETURNING id`, [
      productId,
      name,
    ]);
  }
  for (const [currency, priceCents] of Object.entries(prices)) {
    await m.query(
      `INSERT INTO plan_prices ("planId", currency, "priceCents") VALUES ($1, $2, $3)
       ON CONFLICT ("planId", currency) DO UPDATE SET "priceCents" = EXCLUDED."priceCents"`,
      [plan.id, currency, priceCents],
    );
  }
  return plan.id;
}

/** Idempotente: se puede correr varias veces sin duplicar nada. No pisa métodos de pago ni settings editados. */
export async function runSeed(ds: DataSource, env: SeedEnv): Promise<void> {
  const crypto = new CryptoService(env.LICENSE_ENC_KEY);
  const adminHash = await hash(env.ADMIN_PASSWORD, 12);

  await ds.transaction(async (m) => {
    await m.query(
      `INSERT INTO users (email, "passwordHash", name, role, "emailVerifiedAt")
       VALUES ($1, $2, '[Admin]', 'ADMIN', now())
       ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = 'ADMIN'`,
      [env.ADMIN_EMAIL.trim().toLowerCase(), adminHash],
    );

    const [category]: { id: string }[] = await m.query(
      `INSERT INTO categories (name) VALUES ('[Categoría demo]')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const [product]: { id: string }[] = await m.query(
      `INSERT INTO products (name, slug, "categoryId") VALUES ('[Producto demo]', 'producto-demo', $1)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [category.id],
    );

    const demoPlanId = await upsertPlan(m, product.id, '[Plan demo]', { PEN: 1000, USD: 300 });
    await upsertPlan(m, product.id, '[Plan demo solo PEN]', { PEN: 1000 });

    let [batch]: { id: string }[] = await m.query(
      `SELECT id FROM license_batches WHERE "planId" = $1 AND notes = '[seed]'`,
      [demoPlanId],
    );
    if (!batch) {
      [batch] = await m.query(
        `INSERT INTO license_batches ("planId", "unitCostCents", "costCurrency", "fxRatePen", notes)
         VALUES ($1, 200, 'USD', 3.6200, '[seed]') RETURNING id`,
        [demoPlanId],
      );
    }
    for (let i = 1; i <= 5; i++) {
      const secret = `DEMO-${String(i).padStart(4, '0')}`;
      // El HMAC es determinista: ON CONFLICT evita duplicar la clave al re-ejecutar.
      await m.query(
        `INSERT INTO license_items ("planId", "batchId", "secretEncrypted", "secretHash")
         VALUES ($1, $2, $3, $4) ON CONFLICT ("secretHash") DO NOTHING`,
        [demoPlanId, batch.id, crypto.encrypt(secret), crypto.hash(secret)],
      );
    }

    for (const [index, method] of PAYMENT_METHODS.entries()) {
      await m.query(
        `INSERT INTO payment_methods (code, name, kind, currencies, instructions, "sortOrder")
         VALUES ($1, $2, $3, $4::char(3)[], $5::jsonb, $6)
         ON CONFLICT (code) DO NOTHING`,
        [method.code, method.name, method.kind, method.currencies, JSON.stringify(method.instructions), index + 1],
      );
    }

    await m.query(
      `INSERT INTO settings (key, value) VALUES ('reservationTtlMinutes', '30'::jsonb) ON CONFLICT (key) DO NOTHING`,
    );
  });
}

async function main(): Promise<void> {
  const env = validateEnv(process.env as Record<string, unknown>);
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('Define ADMIN_EMAIL y ADMIN_PASSWORD en .env antes de correr el seed');
  }
  const ds = await new DataSource(buildDataSourceOptions(env)).initialize();
  try {
    await runSeed(ds, {
      ADMIN_EMAIL: env.ADMIN_EMAIL,
      ADMIN_PASSWORD: env.ADMIN_PASSWORD,
      LICENSE_ENC_KEY: env.LICENSE_ENC_KEY,
    });
    console.log('Seed aplicado');
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:e2e -- seed`
Expected: PASS (3 pruebas).

- [ ] **Step 5: Seed en desarrollo y prueba manual de punta a punta**

```bash
npm run migration:run
npm run seed
npm run seed
```

Expected: `Seed aplicado` dos veces, sin errores.

Con `npm run start:dev` corriendo:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$(grep ADMIN_EMAIL .env | cut -d= -f2)\",\"password\":\"$(grep ADMIN_PASSWORD .env | cut -d= -f2)\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
PLAN=$(docker compose exec -T postgres psql -U freecell -d freecell -tAc "SELECT id FROM plans WHERE name = '[Plan demo]'")
curl -s -X POST http://localhost:3000/orders -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"currency\":\"USD\",\"items\":[{\"planId\":\"$PLAN\",\"qty\":1}]}"
```

Expected: JSON con `"status":"PENDING_PAYMENT"`, `"currency":"USD"`, `"totalCents":300`.

- [ ] **Step 6: Commit**

```bash
git add src/database/seed.ts test/seed.e2e-spec.ts
git commit -m "Backend: seed idempotente con admin, catálogo demo y métodos de pago

Plan demo con precio en PEN y USD, plan solo en PEN, lote en USD con
tasa placeholder y 5 licencias cifradas. Métodos y settings no se pisan
al re-ejecutar. Todos los datos de negocio son placeholders."
```

---

### Task 11: Docker multi-stage, Compose con perfil `app` y borrador de Fly.io

> Antes de empezar, cargar la skill `multi-stage-dockerfile` y contrastar el Dockerfile de abajo con sus recomendaciones; aplicar solo mejoras compatibles con estas restricciones (Node 22 LTS, usuario no-root, tini, solo `dist` + dependencias de producción).

**Files:**
- Create: `backend/src/database/run-migrations.ts`
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `backend/fly.toml`
- Modify: `backend/docker-compose.yml` (perfil `app`)

**Interfaces:**
- Consumes: `buildDataSourceOptions` (Tarea 2), `dist/main.js` y `dist/worker.js` (Tareas 5 y 9).
- Produces: imagen `freecell-backend:local`; comando de migraciones `node dist/database/run-migrations.js`.

- [ ] **Step 1: Script de migraciones para producción** — `src/database/run-migrations.ts`

```ts
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

/** Corre las migraciones pendientes con el código compilado (release_command de Fly, servicio migrate de Compose). */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Falta DATABASE_URL');
  }
  const ds = await new DataSource(
    buildDataSourceOptions({ DATABASE_URL: url, DB_SSL: process.env.DB_SSL === 'true' }),
  ).initialize();
  try {
    const applied = await ds.runMigrations({ transaction: 'each' });
    console.log(`Migraciones aplicadas: ${applied.length}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: `.dockerignore`**

```
node_modules
dist
coverage
test
.env
.env.*
!.env.example
*.md
docker-compose.yml
fly.toml
.git
```

- [ ] **Step 3: `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
# Una imagen, dos procesos: node dist/main.js (API) y node dist/worker.js (processors).
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app

# Dependencias completas para compilar.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Solo dependencias de producción.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
# El worker no expone HTTP: en Compose se desactiva este healthcheck para ese servicio.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
```

- [ ] **Step 4: Perfil `app` en `docker-compose.yml`**

Agregar al inicio del archivo (antes de `services:`):

```yaml
x-backend: &backend
  build: .
  image: freecell-backend:local
  env_file: .env
  environment:
    NODE_ENV: production
    DATABASE_URL: postgresql://freecell:freecell@postgres:5432/freecell
    REDIS_URL: redis://redis:6379/0
    DB_SSL: 'false'
```

y dentro de `services:` (después de `redis`):

```yaml
  migrate:
    <<: *backend
    profiles: ['app']
    command: ['node', 'dist/database/run-migrations.js']
    healthcheck:
      disable: true
    depends_on:
      postgres:
        condition: service_healthy

  api:
    <<: *backend
    profiles: ['app']
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: production
      APP_ROLE: api
      DATABASE_URL: postgresql://freecell:freecell@postgres:5432/freecell
      REDIS_URL: redis://redis:6379/0
      DB_SSL: 'false'
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy

  worker:
    <<: *backend
    profiles: ['app']
    command: ['node', 'dist/worker.js']
    environment:
      NODE_ENV: production
      APP_ROLE: worker
      DATABASE_URL: postgresql://freecell:freecell@postgres:5432/freecell
      REDIS_URL: redis://redis:6379/0
      DB_SSL: 'false'
    healthcheck:
      disable: true
    depends_on:
      migrate:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
```

- [ ] **Step 5: `fly.toml` (borrador; el despliegue real es Sprint 4)**

```toml
# Borrador para Sprint 4 (D48). Completar app y región antes de `fly launch`.
app = "[nombre-de-la-app-en-fly]"
primary_region = "[región]"

[build]
  dockerfile = "Dockerfile"

[deploy]
  # Corre en una máquina temporal con la misma imagen antes de cada despliegue.
  release_command = "node dist/database/run-migrations.js"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[processes]
  app = "node dist/main.js"
  worker = "node dist/worker.js"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "off"
  processes = ["app"]

  [[http_service.checks]]
    grace_period = "20s"
    interval = "30s"
    method = "GET"
    path = "/health"
    timeout = "5s"

# Secretos (fly secrets set): DATABASE_URL, DB_SSL=true, REDIS_URL, JWT_SECRET, JWT_REFRESH_PEPPER,
# LICENSE_ENC_KEY, CORS_ORIGIN. APP_ROLE no hace falta: en producción el default es "api",
# y el proceso worker usa su propio entrypoint.
```

- [ ] **Step 6: Construir y verificar la imagen**

Detener `npm run start:dev` si está corriendo (usa el puerto 3000).

```bash
docker build -t freecell-backend:local .
docker image ls freecell-backend:local
docker run --rm --entrypoint id freecell-backend:local -u
docker run --rm --entrypoint sh freecell-backend:local -c "ls /app; ls /app/node_modules/.bin | grep -c nest || true"
```

Expected: la imagen se construye; `id -u` imprime `1000` (usuario `node`, no root); `/app` contiene solo `dist`, `node_modules` y `package.json`; el conteo de `nest` en `.bin` es `0` (sin dependencias de desarrollo).

- [ ] **Step 7: Levantar el stack completo con Compose**

```bash
docker compose --profile app up -d --build
docker compose --profile app ps
curl -s http://localhost:3000/health
curl -s http://localhost:3000/health/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs
docker compose logs worker | tail -n 5
docker compose --profile app down
```

Expected: `migrate` termina con código 0 (`Migraciones aplicadas: N`); `api` queda `healthy`; `/health` → `{"status":"ok"}`; `/health/ready` → `"status":"ok"`; `/docs` → `404` (Swagger apagado en producción); los logs del worker muestran `Worker iniciado`. `down` no borra el volumen de datos.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore fly.toml docker-compose.yml src/database/run-migrations.ts
git commit -m "Backend: Dockerfile multi-stage, perfil app en Compose y borrador de Fly

Imagen Node 22 slim con tini, usuario no-root y solo dependencias de
producción. Compose levanta migrate, api y worker con la misma imagen.
fly.toml con process groups y migraciones como release_command."
```

---

### Task 12: Documentación — `docs/backend/` y actualización de los documentos de producto

> Cargar la skill `document` y seguirla para generar `docs/backend/` **leyendo el código terminado** (no la spec). Este paso de la tarea define el contenido mínimo que esa documentación debe cubrir.

**Files:**
- Create: `docs/backend/README.md`, `docs/backend/auth.md`, `docs/backend/orders.md`, `docs/backend/queues.md`, `docs/backend/database.md`, `docs/backend/deployment.md`
- Modify: `docs/02-requerimientos-funcionales.md`, `docs/03-requerimientos-no-funcionales.md`, `docs/04-arquitectura.md`, `docs/05-modelo-de-datos.md`, `docs/06-api.md`, `docs/08-plan-de-sprints.md`, `docs/09-decisiones-y-preguntas-abiertas.md`, `docs/01-vision-y-alcance.md`
- Modify: `CLAUDE.md`, `backend/README.md`

- [ ] **Step 1: Generar `docs/backend/` con la skill `document`**

Contenido mínimo por archivo (verificar cada dato contra `backend/src/`):

- `README.md`: índice; requisitos (Node, Docker); cómo levantar (`docker compose up -d`, `cp .env.example .env`, generar secretos, `npm install`, `npm run migration:run`, `npm run seed`, `npm run start:dev`); tabla de variables de entorno (las de `EnvironmentVariables`, con su regla); scripts de `package.json`; cómo correr pruebas; puertos (API 3000, web 3001).
- `auth.md`: endpoints `/auth/*` con cuerpo, respuesta y errores; tokens (JWT 15 min, refresh opaco 30 días, HMAC con pepper); diagrama de rotación con ventana de gracia de 30 s y detección de reuso; guards globales y `@Public`/`@Roles`/`@CurrentUser`; rate limits.
- `orders.md`: `POST /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`; algoritmo de reserva (orden por `planId`, `SKIP LOCKED`, rechazo completo); monedas y precio congelado; errores 400/404/409 con sus mensajes exactos.
- `queues.md`: colas `orders` (jobs `release-<id>`, scheduler `sweep-expired` cada 5 min) y `notifications` (key/jobId `order-created-<id>`, huella en `notification_logs`); procesos API/worker y `APP_ROLE`.
- `database.md`: las 19 tablas con columnas clave; CHECK e índices parciales; triggers, vistas (`v_plan_stock`, `v_sales_lines` y su fórmula de margen) y funciones (`fn_release_order`, `fn_release_expired`); cómo crear una migración nueva.
- `deployment.md`: Dockerfile por etapas; Compose perfil `app`; `fly.toml` (process groups, `release_command`, secretos); qué falta para Sprint 4.

- [ ] **Step 2: Actualizar los documentos de producto**

- `docs/05-modelo-de-datos.md`: cambiar "Fuente de verdad" a `backend/src/database/entities/*.ts` y `backend/src/database/migrations/`; quitar `priceCents`/`currency` de `plans`; agregar filas `plan_prices`, `payment_methods`, `refresh_tokens`; en `license_batches` agregar `costCurrency` y `fxRatePen`; en `payments` reemplazar `method` por `paymentMethodId` y documentar unicidad `(paymentMethodId, operationNumber)`; en `claims` agregar `orderId`; agregar sección "Lógica en base de datos (D57)" con triggers, vistas y funciones; actualizar la fórmula de margen (D62).
- `docs/06-api.md`: quitar el aviso de "por reconstruir"; marcar ✅ `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /orders` (con el body `{currency, items, toolUsername?}`), `GET /orders/:id`, `POST /orders/:id/cancel`; agregar ✅ `POST /auth/refresh`, `POST /auth/logout`, `GET /health/ready`, `GET /docs` (solo fuera de producción); en `POST /orders/:id/payment` cambiar `method` por `paymentMethodId`.
- `docs/02-requerimientos-funcionales.md`: RF-AUT-01..05 ✅; RF-COM-01 y RF-COM-02 ✅; en RF-COM-03 cambiar "Yape/Plin o transferencia" por "métodos de pago configurables (billeteras, transferencia y cripto en USDT para pedidos en USD, D63)".
- `docs/03-requerimientos-no-funcionales.md`: RNF-SEG-03 ✅, RNF-SEG-04 ✅ ("JWT 15 min + refresh rotativo, D56"), RNF-SEG-08 ✅, RNF-OBS-01 ✅, RNF-OBS-02 ✅.
- `docs/04-arquitectura.md`: reemplazar el árbol `api/src` por la estructura real de `backend/src`; documentar los dos procesos (API y worker) y `APP_ROLE`; quitar la decisión técnica 7 ("1 licencia por pedido"), reemplazada por el carrito.
- `docs/08-plan-de-sprints.md`: Sprint 1 → ✅ (fecha de cierre) con la lista de lo entregado; quitar del Sprint 2 lo que ya quedó hecho (migraciones del esquema, rate limiting, helmet).
- `docs/09-decisiones-y-preguntas-abiertas.md`: agregar D56–D65 en la sección A copiando la tabla de la sección 1 de la spec; en D51 anotar "Reemplazada en parte por D61 (precios en `plan_prices`)"; en riesgos, agregar "Cobro en criptoactivos: implicancias SUNAT/UIF, revisar con un contador antes de activar métodos CRYPTO".
- `docs/01-vision-y-alcance.md`: donde dice "paga por Yape/Plin o transferencia", agregar "u otros métodos configurables, incluido USDT para pedidos en dólares".

- [ ] **Step 3: Actualizar `CLAUDE.md` y `backend/README.md`**

`CLAUDE.md`:
- En "Estado", reemplazar el bloque ⚠️ del reinicio por: "✅ Sprint 1 (Fundaciones) reconstruido el [fecha]: esquema completo con lógica en Postgres, auth con refresh rotativo, reserva de carrito, colas, Docker. Ver `docs/backend/`."
- En "Comandos", quitar la nota de scaffold vacío y dejar la lista real: `cp .env.example .env`, `docker compose up -d`, `npm install`, `npm run migration:run`, `npm run seed`, `npm run start:dev` (API) / `npm run start:worker`, `npm run typecheck && npm test && npm run test:e2e`, `npm run migration:generate -- src/database/migrations/Nombre`, `docker compose --profile app up -d --build`.
- En "Frontend", cambiar `npm run dev` → http://localhost:3000 por `npm run dev -- --port 3001` → http://localhost:3001 (D60).
- En "Reglas del proyecto / Código", agregar: "Lógica crítica también en Postgres (triggers, CHECK, funciones; D57): un cambio de reglas de estado exige migración nueva."

`backend/README.md`: reemplazar el contenido por un resumen corto (qué es, cómo levantarlo, cómo probar) que enlace a `../docs/backend/README.md`.

- [ ] **Step 4: Verificación final completa**

```bash
cd backend
npm run typecheck
npm test
npm run test:e2e
npm run lint
```

Expected: typecheck sin errores; unitarias y e2e en verde; `lint` sin errores (las advertencias de `no-unsafe-*` sobre resultados de `query()` se aceptan; corregir cualquier error).

- [ ] **Step 5: Commit**

```bash
cd ..
git add docs CLAUDE.md backend/README.md
git commit -m "Docs: referencia del backend y estado de Sprint 1

docs/backend/ generado desde el código. Actualiza modelo de datos, API,
requisitos, arquitectura, plan de sprints y decisiones D56-D65."
```

---

## Cobertura de la spec

| Sección de la spec | Tarea |
|---|---|
| 1. Decisiones D56–D65 | 2, 3, 6, 8 (código); 12 (registro en `docs/09`) |
| 2. Estructura, env, dependencias, scripts | 1, 5, 9 |
| 3.1 InitialSchema, monedas, pagos, refresh_tokens, restricciones | 2 |
| 3.2 Triggers, vistas, funciones | 3 |
| 3.3 Seed | 10 |
| 4. Auth, tokens, guards, rate limit, auditoría | 6 |
| 5. Pedidos, reserva, cancelación | 8 |
| 5. Colas (release, sweep, notificaciones) | 7, 9 |
| 6. Cifrado, auditoría, errores, logs, health, Swagger, HTTP | 4, 5 |
| 7. Pruebas (unitarias y e2e) | 1–10 |
| 8. Docker y Fly | 11 |
| 9. Documentación | 12 |
