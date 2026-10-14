# Backend — índice

Documentación generada **leyendo el código terminado** en `backend/src/` (no la spec ni el plan). Cubre el alcance de
Sprint 1 — Fundaciones: esquema completo con lógica en Postgres, auth propia con refresh rotativo, reserva de
carrito, colas BullMQ, cifrado y auditoría, Docker/Fly.

| Archivo | Contenido |
|---|---|
| `auth.md` | Endpoints `/auth/*`, tokens (JWT + refresh opaco rotativo), rotación con ventana de gracia, guards globales, rate limits |
| `orders.md` | Endpoints `/orders/*`, algoritmo de reserva de carrito, monedas y precio congelado, errores |
| `queues.md` | Colas BullMQ (`orders`, `notifications`), jobs, scheduler, procesos API/worker |
| `database.md` | Las 19 tablas, restricciones e índices, triggers/vistas/funciones de Postgres, cómo migrar |
| `deployment.md` | Dockerfile multi-stage, `docker-compose.yml` (perfil `app`), `fly.toml`, pendientes de Sprint 4 |

## Requisitos
- Node.js 22 (imagen `node:22-bookworm-slim` en Docker).
- Docker + Docker Compose (PostgreSQL 16 + Redis 7 en desarrollo).
- npm (usa `.npmrc` con `legacy-peer-deps=true`: el peer opcional de `ioredis` en `typeorm` rompe `npm ci` sin eso).

## Cómo levantarlo (desarrollo)
```bash
cd backend
cp .env.example .env
# completa JWT_SECRET, JWT_REFRESH_PEPPER (≥32 caracteres cada uno) y LICENSE_ENC_KEY (base64 de 32 bytes):
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET / JWT_REFRESH_PEPPER
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # LICENSE_ENC_KEY
# completa ADMIN_EMAIL / ADMIN_PASSWORD (solo los usa `npm run seed`)
docker compose up -d        # Postgres 16 + Redis 7
npm install
npm run migration:run       # aplica InitialSchema + DatabaseLogic
npm run seed                # admin + catálogo demo + métodos de pago
npm run start:dev           # API en http://localhost:3000 (dev corre API + workers juntos, APP_ROLE=all)
```
El frontend corre en el puerto 3001 (`npm run dev -- --port 3001` en `frontend/`, D60); `CORS_ORIGIN` por defecto es
`http://localhost:3001`.

Para correr el worker en un proceso separado (como en producción): `npm run start:worker`.

## Variables de entorno
Validadas al arrancar por `EnvironmentVariables` (`src/core/config/env.validation.ts`, `class-validator`). El proceso
no levanta si falta o es inválida alguna obligatoria.

| Variable | Regla | Default |
|---|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `APP_ROLE` | `api` \| `worker` \| `all`. Si no se define: `all` fuera de producción, `api` en producción. | `all` (dev) / `api` (prod) |
| `PORT` | entero 1–65535 | `3000` |
| `DATABASE_URL` | string, obligatoria | — |
| `DB_SSL` | boolean (`true` en Neon) | `false` |
| `REDIS_URL` | string, obligatoria | — |
| `JWT_SECRET` | string, mínimo 32 caracteres | — |
| `JWT_REFRESH_PEPPER` | string, mínimo 32 caracteres | — |
| `LICENSE_ENC_KEY` | string; debe decodificar en base64 a **exactamente 32 bytes** | — |
| `CORS_ORIGIN` | string, orígenes separados por comas | `http://localhost:3001` |
| `THROTTLE_ENABLED` | boolean; en `false` desactiva el rate limit (lo usan las pruebas) | `true` |
| `LOG_LEVEL` | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`\|`silent` | `info` |
| `ADMIN_EMAIL` | email, opcional (solo para `npm run seed`) | — |
| `ADMIN_PASSWORD` | string, mínimo 12 caracteres, opcional (solo para `npm run seed`) | — |

## Scripts (`package.json`)
| Script | Qué hace |
|---|---|
| `build` | `nest build` |
| `start` / `start:dev` / `start:debug` | Arranca `dist/main.js` (prod/watch/debug) |
| `start:worker` | `nest start --watch --entryFile worker` (proceso worker, sin HTTP) |
| `start:prod` | `node dist/main` |
| `lint` | `eslint ... --fix` |
| `typecheck` | `tsc --noEmit -p tsconfig.json` |
| `migration:generate` / `migration:run` / `migration:revert` | TypeORM CLI contra `src/database/data-source.ts` |
| `migration:create` | Crea un archivo de migración vacío |
| `seed` | `ts-node src/database/seed.ts` — admin, catálogo demo, métodos de pago, settings |
| `test` / `test:watch` / `test:cov` / `test:debug` | Jest (unitarias, `src/**/*.spec.ts`) |
| `test:e2e` | Jest con `test/jest-e2e.json`, `--runInBand`, contra Postgres/Redis reales |

## Pruebas
```bash
npm test          # unitarias: CryptoService, sanitizeMeta, validateEnv, decideRefresh, AllExceptionsFilter
npm run test:e2e   # e2e: auth, orders, concurrency, release, db-logic, notifications, health, schema, seed
```
Las e2e usan la base `licencias_test` y Redis `/1` (Docker Compose los crea); `globalSetup` (`test/global-setup.ts`)
borra el esquema y corre las migraciones reales (no `synchronize`), así existen los triggers, vistas y funciones de
Postgres. Cada archivo trunca las tablas al empezar (excepto `migrations`) y vacía Redis `/1`: no tocan datos de
desarrollo.

## Puertos
- API (y worker en dev con `APP_ROLE=all`): **3000**.
- Web (frontend Next.js): **3001** (D60).
