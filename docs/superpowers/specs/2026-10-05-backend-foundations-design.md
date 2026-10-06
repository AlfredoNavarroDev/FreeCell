# Backend — Fundaciones (Sub-proyecto 1) · Diseño

- **Fecha:** 2026-10-05
- **Estado:** aprobado en brainstorming, pendiente de revisión escrita
- **Alcance:** reconstrucción de Sprint 1 (`docs/08`) sobre el scaffold vacío de `backend/`, con el esquema final
  de datos (D14–D55) y transversales adelantados (Swagger, pino, helmet/throttler, `/health/ready`).
- **Rama:** `feat/backend-foundations` (desde `main`).

## 0. Descomposición del backend

| # | Sub-proyecto | Contenido |
|---|---|---|
| **1** | **Fundaciones (este documento)** | Configuración, esquema completo + lógica en DB, auth propia, reserva de carrito, colas, cifrado, auditoría, observabilidad, Docker, `docs/backend/` |
| 2 | Sprint 2 | Catálogo, pagos del cliente, R2, revelar clave, `/auth/google`, verificación de correo, CRUD admin |
| 3 | Sprint 3 | Inventario y lotes, aprobación de pagos, reclamos, soporte, reseñas, reportes, Resend |
| 4 | Sprint 4 | Alertas, Bull Board, Sentry, CI, despliegue en Fly.io |

Cada sub-proyecto tiene su propio ciclo spec → plan → implementación.

## 1. Decisiones de este diseño

| Id | Decisión | Razón |
|---|---|---|
| — | La migración inicial trae el **esquema completo** de `docs/05` (todas las tablas de Sprint 1–4). | Ninguna migración se ha aplicado; evita ALTERs posteriores y mantiene el modelo coherente desde el día 1. |
| — | Arquitectura: **módulos de dominio + TypeORM en servicios** (enfoque A). Un servicio por flujo cuando un archivo supere ~300 líneas. | Menos capas; las reglas críticas viven en Postgres de todos modos. |
| D56 | Tokens: **access JWT de 15 min + refresh opaco rotativo de 30 días**, guardado como hash en `refresh_tokens`, con detección de reuso por familia. | Revocación real (cuentas admin), cierra RNF-SEG-04. |
| D57 | **Lógica en base de datos** como defensa en profundidad: triggers de transición de estado, invariantes diferidas, `audit_logs` inmutable, vistas de stock y ventas, funciones de liberación. La reserva se queda en TypeScript. | Un bug en un servicio no puede violar las reglas 1 y 3; la reserva necesita mensajes 409 por ítem. |
| D58 | `license_items.secretHash` = **HMAC-SHA256** con clave derivada de `LICENSE_ENC_KEY` (no SHA-256 plano). | Un SHA-256 plano permite confirmar claves por fuerza bruta a quien lea la DB. |
| D59 | **Auth propia** (se mantienen D46/D53). Clerk se evaluó y se descartó. | Control total, sin dependencia externa para el login, sin datos personales fuera del país (Ley 29733), mayor valor de portafolio. |
| D60 | Puertos locales: **API 3000**, **web 3001**. | Ambos usaban 3000; la API conserva la base de `docs/06`. |
| — | Workers: **una imagen, dos procesos** (`dist/main.js` HTTP, `dist/worker.js` processors). `APP_ROLE=all` en dev corre ambos en un proceso. | La API escala sin duplicar workers; un job pesado no afecta la latencia HTTP. |
| — | `POST /orders` nace con **carrito** `items[]` (D30). | Evita reescribir la parte más delicada en Sprint 2. |

D56–D60 se registran en `docs/09` (sección A).

## 2. Estructura, arranque y configuración

```
backend/src/
  main.ts            HTTP: helmet, CORS, ValidationPipe, pino, Swagger (no-prod), shutdown hooks
  worker.ts          createApplicationContext(WorkerModule), sin HTTP
  app.module.ts      CoreModule + módulos HTTP (+ processors si APP_ROLE=all)
  worker.module.ts   CoreModule + processors
  core/              config (validación de env), database, queues (conexión Redis), logger
  common/            crypto, guards, decorators, filtros de error, paginación
  database/          entities/, views/, enums.ts, migrations/, data-source.ts, seed.ts
  auth/  users/  orders/  licenses/  notifications/  audit/  health/
```

**Variables de entorno**, validadas al arrancar con una clase `EnvironmentVariables` (`class-validator`); el proceso
no arranca si alguna falta o es inválida:

| Variable | Regla |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `APP_ROLE` | `api` \| `worker` \| `all` (default `all` en dev) |
| `PORT` | default `3000` |
| `DATABASE_URL`, `DB_SSL` | obligatoria; `DB_SSL=true` en Neon |
| `REDIS_URL` | obligatoria |
| `JWT_SECRET`, `JWT_REFRESH_PEPPER` | mínimo 32 caracteres |
| `LICENSE_ENC_KEY` | base64 que decodifica a exactamente 32 bytes |
| `CORS_ORIGIN` | lista separada por comas |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | solo para el seed |

`.env.example` con placeholders. Ningún secreto real en el repositorio.

**Dependencias** (versiones fijadas, nada v12 ESM): `@nestjs/config@4`, `@nestjs/jwt@11`, `@nestjs/passport@11`,
`@nestjs/bullmq@11`, `@nestjs/typeorm@11`, `@nestjs/swagger@11`, `@nestjs/terminus@11`, `@nestjs/throttler@6`,
`@nest-lab/throttler-storage-redis`, `nestjs-pino`, `pino-http`, `typeorm@0.3`, `pg`, `bullmq`, `ioredis`,
`bcryptjs`, `passport-jwt`, `class-validator`, `class-transformer`, `helmet`. Si alguna versión exacta rompe con
CommonJS/Jest, se fija la última compatible y se anota en `docs/04`.

**Scripts:** `typecheck`, `migration:generate|run|revert`, `seed`, `start:worker`, `test`, `test:e2e`.

## 3. Modelo de datos

### 3.1 Migración `InitialSchema` (generada)
Las 17 tablas de `docs/05` más `refresh_tokens`. Convenciones: PK `uuid`, `timestamptz`, dinero `int` en céntimos,
enums nativos de Postgres, `createdAt`/`updatedAt` en todas las tablas salvo `audit_logs` (solo `createdAt`).

**`refresh_tokens`** (nueva): `id`, `userId`, `tokenHash` único, `familyId`, `expiresAt`, `revokedAt` (nullable),
`replacedById` (nullable), `createdAt`. Índice `(familyId)`.

**Ajuste a `docs/05`:** `claims` gana la columna `orderId` (FK), necesaria para el índice único parcial "un reclamo
`OPEN` por pedido" (invariante 6).

**Restricciones:**
- `users.email` único (se normaliza con `trim().toLowerCase()` en el servicio); `users.googleId` único nullable;
  `CHECK (passwordHash IS NOT NULL OR googleId IS NOT NULL)` (invariante 10).
- `license_items.secretHash` único; índice `(planId, status)`; `orderItemId` único parcial
  `WHERE status IN ('RESERVED','SOLD')`.
- `CHECK` en `license_items`: `status='AVAILABLE'` ⇒ `orderItemId IS NULL AND reservedUntil IS NULL`;
  `status IN ('RESERVED','SOLD')` ⇒ `orderItemId IS NOT NULL` (invariantes 1 y 2).
- `orders.orderNumber` único, por defecto `nextval('order_number_seq')`, secuencia que empieza en 1001.
  Índice `(status, expiresAt)`.
- `payments.operationNumber` único, `payments.proofHash` único, único parcial `(orderId) WHERE status='PENDING'`.
- `claims` único parcial `(orderId) WHERE status='OPEN'`.
- `notification_logs.key` único, `settings.key` único, índice `audit_logs(entity, entityId)`.
- Índices de colas: `payments(status)`, `claims(status)`, `support_tickets(status)`.

### 3.2 Migración `DatabaseLogic` (escrita a mano, con `down()` completo)

**Triggers**
1. `trg_set_updated_at` (BEFORE UPDATE) en todas las tablas con `updatedAt`.
2. `trg_license_status_guard` (BEFORE UPDATE OF status en `license_items`). Transiciones permitidas:
   `AVAILABLE→RESERVED`, `RESERVED→AVAILABLE`, `RESERVED→SOLD`, `SOLD→VOID`, `AVAILABLE→VOID`.
   Cualquier otra lanza `RAISE EXCEPTION` con `ERRCODE='P0001'`.
3. `trg_order_status_guard` (BEFORE UPDATE OF status en `orders`). Transiciones de `docs/04`:
   `PENDING_PAYMENT→IN_REVIEW|CANCELLED`, `IN_REVIEW→DELIVERED|PENDING_ACTIVATION|PENDING_PAYMENT|CANCELLED`,
   `PENDING_ACTIVATION→DELIVERED`.
4. `trg_order_total_check`: `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` en `orders` y `order_items`. Al
   hacer COMMIT verifica `orders.totalCents = Σ order_items.unitPriceCents` (invariante 5). La moneda única por
   pedido (invariante 8) la garantiza el servicio, porque `order_items` no tiene columna `currency`.
5. `trg_audit_logs_immutable`: BEFORE UPDATE OR DELETE en `audit_logs` lanza excepción.

**Vistas** (mapeadas con `@ViewEntity`, solo lectura)
- `v_plan_stock`: `planId`, `available`, `reserved`, `sold`, `void`, `stockState`
  (`OUT_OF_STOCK` si available = 0, `LOW` si available ≤ `lowStockThreshold`, si no `IN_STOCK`).
- `v_sales_lines`: una fila por licencia `SOLD`: `orderId`, `orderItemId`, `planId`, `productId`,
  `unitPriceCents`, `unitCostCents` (del lote), `marginCents`, `currency`, `soldAt`.
- Ninguna vista expone `secretEncrypted` ni `secretHash`.

**Funciones**
- `fn_release_order(p_order_id uuid, p_reason text, p_require_expired boolean) RETURNS boolean`.
  Bloquea el pedido con `FOR UPDATE`. Si `status <> 'PENDING_PAYMENT'`, o si `p_require_expired` y
  `expiresAt > now()`, devuelve `false` sin tocar nada. Si no, pasa el pedido a `CANCELLED` con `cancelReason`,
  devuelve sus licencias `RESERVED` a `AVAILABLE` (limpia `orderItemId` y `reservedUntil`) y devuelve `true`.
  La usan el job `release` y el barrido (`p_require_expired = true`) y la cancelación del cliente (`false`).
  La auditoría la escribe el servicio que llama, en la misma transacción.
- `fn_release_expired() RETURNS SETOF uuid`: recorre `orders WHERE status='PENDING_PAYMENT' AND expiresAt <= now()`
  con `FOR UPDATE SKIP LOCKED`, llama a `fn_release_order` y devuelve los ids liberados.

### 3.3 Seed (`npm run seed`, idempotente por upsert)
- Admin desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`, rol `ADMIN`, `emailVerifiedAt` presente.
- Categoría `[Categoría demo]`, producto `[Producto demo]` (`requiresToolUsername=false`), plan `[Plan demo]` con
  `priceCents=1000` como valor placeholder de desarrollo, `currency='PEN'`.
- Lote con 5 licencias `DEMO-0001` … `DEMO-0005`, cifradas.
- `settings`: `reservationTtlMinutes = 30`.

Las tablas de Sprint 2+ (`support_tickets`, `ticket_messages`, `reviews`, `payments`, `claims`) tienen entidad pero
ningún servicio ni controlador en este sub-proyecto.

## 4. Autenticación y autorización

| Ruta | Acceso | Respuesta |
|---|---|---|
| `POST /auth/register` | 🌐 | `201 {accessToken, refreshToken, user}`. Rol siempre `CUSTOMER` (un `role` en el body da 400 por whitelist). 409 si el correo existe. |
| `POST /auth/login` | 🌐 | `200 {accessToken, refreshToken, user}`. 401 "Correo o contraseña incorrectos" en cualquier fallo. |
| `POST /auth/refresh` | 🌐 | Body `{refreshToken}` → par nuevo. 401 si es inválido, vencido o reusado. |
| `POST /auth/logout` | 👤 | Body `{refreshToken}` → revoca su familia. `204`. |
| `GET /auth/me` | 👤 | `{id, email, name, role, phone, emailVerifiedAt}`. |

**Tokens**
- Access: JWT HS256, 15 min, payload `{sub, role}`, firmado con `JWT_SECRET`.
- Refresh: 64 bytes aleatorios en base64url, 30 días. Se guarda solo `tokenHash = HMAC-SHA256(JWT_REFRESH_PEPPER, token)`.
- **Rotación**, en una transacción: `SELECT ... FOR UPDATE` de la fila por `tokenHash`.
  - No existe o está vencido: 401.
  - `revokedAt` no nulo (reuso): se revoca toda la familia, se audita `auth.refresh_reuse_detected` y se responde 401.
  - Válido: se marca `revokedAt`, se crea el nuevo token en la misma familia con `replacedById` y se devuelve el par.
  - Dos refresh simultáneos con el mismo token: uno gana; el otro encuentra la fila revocada y cae en la detección de reuso.

**Contraseñas:** bcryptjs con cost 12. DTO: contraseña de 8 a 72 caracteres, correo válido, `name` opcional de hasta 80.

**Guards**
- `JwtAuthGuard` **global**; `@Public()` marca las excepciones.
- `RolesGuard` global con `@Roles('ADMIN')`.
- `@CurrentUser()` inyecta `{id, role}`.
- La propiedad se verifica en los servicios: las consultas filtran por `userId`, y un recurso ajeno da **404**.

**Rate limit** (`@nestjs/throttler` con almacenamiento en Redis): global 100/min por IP; login 5/min; registro 3/min;
refresh 10/min. Superarlo da 429 "Demasiados intentos, espera un momento".

**Auditoría:** `auth.login_failed` (`meta: {email}`), `auth.refresh_reuse_detected` (`meta: {familyId}`).

## 5. Pedidos, reserva y colas

| Ruta | Acceso | Notas |
|---|---|---|
| `POST /orders` | 👤 | Body `{items:[{planId, qty}], toolUsername?}`, de 1 a 10 ítems, `qty` de 1 a 5, `planId` sin repetir. `201 {id, orderNumber, status, totalCents, currency, expiresAt, items:[{planId, unitPriceCents}]}`. |
| `GET /orders/:id` | 👤 | El mismo shape más `cancelReason`. 404 si no es del usuario. |
| `POST /orders/:id/cancel` | 👤 | Solo en `PENDING_PAYMENT`; si no, 409. Si ya está `CANCELLED`, `200` sin cambios (idempotente). |

**`OrdersService.create`**, en una transacción:
1. Carga los planes con su producto. Si un plan no existe o está inactivo (él o su producto), 404. Si mezclan monedas,
   409 "El carrito tiene planes en monedas distintas". Si un producto `requiresToolUsername` llega sin `toolUsername`,
   400 (invariante 9).
2. Ordena los ítems por `planId`, para que todas las transacciones bloqueen en el mismo orden.
3. Por plan: `SELECT id FROM license_items WHERE "planId"=$1 AND status='AVAILABLE' ORDER BY "createdAt"
   LIMIT $qty FOR UPDATE SKIP LOCKED`. Si vuelven menos filas que `qty`, rollback y 409 "Sin stock suficiente de
   {nombre del plan}". No queda nada reservado.
4. Lee el TTL de `settings.reservationTtlMinutes` (30 si falta). Inserta el pedido con `expiresAt = now() + TTL` y
   `totalCents`, una `order_item` por unidad con `unitPriceCents = plan.priceCents`, y pasa cada licencia a
   `RESERVED` con `orderItemId` y `reservedUntil = expiresAt`.
5. Audita `order.created` (`meta: {items, totalCents}`).
6. Después del COMMIT encola `release` (`jobId=release-{orderId}`, retraso = TTL) y la notificación
   `order-created:{orderId}`. Si Redis falla, registra una advertencia y responde 201 igual: el barrido cubre la liberación.

**Cancelación:** `fn_release_order(id, 'CUSTOMER_CANCELLED', false)` más auditoría `order.cancelled`, en una transacción.

**Colas BullMQ**
- `orders`:
  - `release`: llama a `fn_release_order(id, 'EXPIRED', true)` y audita si devuelve `true`.
  - `sweep-expired`: con `upsertJobScheduler` cada 5 min; llama a `fn_release_expired()` y audita cada id.
- `notifications`: job `send {key, template, recipient, data}` con `jobId = key`.
  - El processor hace `INSERT` en `notification_logs` (falla por la `key` única si ya se envió, y entonces termina sin enviar).
  - Llama a `NotificationChannel.send`; si falla, borra la fila y relanza el error.
  - 3 intentos con backoff exponencial.
  - `LogChannel` es la única implementación en Fundaciones; no registra claves ni tokens.
- Opciones por defecto: `removeOnComplete: 1000`, `removeOnFail: 5000`.
- Los processors se registran solo en `WorkerModule` o con `APP_ROLE=all`.

## 6. Cifrado, auditoría, errores y observabilidad

- **`CryptoService`**
  - `encrypt` usa AES-256-GCM con un IV aleatorio de 12 bytes y produce `base64(iv):base64(tag):base64(ct)`.
  - `decrypt` verifica el tag y lanza un error si no coincide.
  - `hash` calcula HMAC-SHA256 con una clave derivada por HKDF de `LICENSE_ENC_KEY`, con info `secret-hash`.
  - `secretEncrypted` y `secretHash` tienen `select: false`.
- **`AuditService.log(manager, entry)`** escribe en la transacción del llamador. `meta` se sanitiza de forma recursiva
  y elimina las llaves que contienen `secret`, `password`, `token` o `key`.
- **Filtro de errores global**
  - Formato `{statusCode, message, error}` con mensajes en español.
  - Postgres `23505` da 409 "El recurso ya existe"; `23514` y `P0001` dan 409 "Operación no permitida en el estado actual".
  - Un 500 responde "Error interno"; el detalle va solo al log, con el request id.
  - Las validaciones (`class-validator`) usan mensajes en español.
- **Logs**: `nestjs-pino`, JSON en producción y `pino-pretty` en dev. `X-Request-Id` se propaga o se genera (UUID) y se devuelve en la respuesta. Se redactan `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.refreshToken`, `*.accessToken` y `*.secret`.
- **Health** (`@nestjs/terminus`, `@Public`, sin throttling): `GET /health` → `{status:'ok'}`; `GET /health/ready`
  verifica Postgres (`SELECT 1`) y Redis (`PING`), y responde 503 si alguno falla.
- **Swagger** en `/docs` solo si `NODE_ENV !== 'production'`, con bearer auth y clases de respuesta explícitas.
- **HTTP**: helmet, CORS desde `CORS_ORIGIN`, `trust proxy` activado, cuerpo JSON de hasta 100 kb, `enableShutdownHooks`.

## 7. Pruebas

**Infraestructura**
- Postgres `licencias_test` y Redis `/1` desde Docker Compose.
- `globalSetup` borra el esquema y corre las **migraciones**, no `synchronize`. Así existen los triggers, las vistas y las funciones.
- Cada archivo trunca las tablas al empezar (excepto `migrations`) y vacía Redis `/1`.
- `--runInBand`. `test/factories.ts` crea usuarios, categorías, productos, planes y licencias.

**Unitarias:** `CryptoService` (ida y vuelta, IV distinto, tag alterado, HMAC determinista); sanitización de
auditoría; validación de entorno (`LICENSE_ENC_KEY` de longitud inválida); rotación de refresh con repositorio simulado.

**e2e**
| Archivo | Casos |
|---|---|
| `auth.e2e-spec.ts` | Registro como CUSTOMER; `role` en el body da 400; correo duplicado da 409; login fallido da 401 genérico; rotación de refresh; reuso que revoca la familia; 2 refresh simultáneos dan un solo éxito; login 6/min da 429; `/me` sin datos sensibles; sin token da 401; CUSTOMER en una ruta `@Roles('ADMIN')` de prueba da 403. |
| `orders.e2e-spec.ts` | Carrito de N ítems reserva todo; un ítem agotado da 409 y no deja nada reservado; precio congelado tras cambiar `priceCents`; monedas mezcladas dan 409; sin `toolUsername` da 400; B no ve el pedido de A (404); cancelar libera; cancelar dos veces es idempotente; cancelar `IN_REVIEW` da 409. |
| `concurrency.e2e-spec.ts` | 20 compras simultáneas contra 5 licencias: 5 aceptadas, 15 con 409, licencias reservadas distintas; carritos cruzados (A,B) y (B,A) terminan sin deadlock. |
| `release.e2e-spec.ts` | Job sobre pedido vencido lo libera; sobre `IN_REVIEW` no hace nada; el barrido libera un pedido sin job; job y barrido en paralelo no fallan ni duplican auditoría. |
| `db-logic.e2e-spec.ts` | UPDATE `SOLD→AVAILABLE` falla; UPDATE/DELETE en `audit_logs` falla; total descuadrado falla al COMMIT; `v_plan_stock` cuenta bien. |
| `notifications.e2e-spec.ts` | El mismo job dos veces envía una sola vez; un fallo libera la fila y el reintento envía. |
| `health.e2e-spec.ts` | `/health` y `/health/ready` responden 200. |

**Criterio de terminado:** `npm run typecheck && npm test && npm run test:e2e` en verde.

## 8. Docker y despliegue

- **`backend/Dockerfile`**, multi-stage:
  - `deps` (`npm ci` con caché de BuildKit).
  - `build` (`nest build`).
  - `prod-deps` (`npm ci --omit=dev`).
  - `runtime` (`node:22-bookworm-slim` con `tini`, `USER node`, `NODE_ENV=production`, solo `dist/`, `node_modules` y `package.json`, `HEALTHCHECK` contra `/health`, `CMD ["node","dist/main.js"]`).
  - Las migraciones se corren con `node dist/database/run-migrations.js` sobre la misma imagen.
- **`.dockerignore`**: `node_modules`, `dist`, `.env*`, `test`, `coverage`, `*.md`.
- **`docker-compose.yml`**:
  - `postgres:16` con volumen e `init-test-db.sql` (crea `licencias_test`).
  - `redis:7`.
  - Perfil `app`: servicios `migrate`, `api` y `worker`, que construyen la imagen.
- **`fly.toml`** (borrador; el despliegue real es Sprint 4): process groups `app` (`node dist/main.js`) y
  `worker` (`node dist/worker.js`), `release_command` de migraciones y health check `/health`.

## 9. Documentación y entrega

- **`docs/backend/`** se genera con la skill `/document` a partir del código terminado: `README.md`, `auth.md`,
  `orders.md`, `queues.md`, `database.md`, `deployment.md`.
- **Actualizaciones en el mismo cambio:**
  - `docs/05`: `refresh_tokens`, `claims.orderId`, sección de triggers, vistas y funciones.
  - `docs/06`: refresh y logout, `items[]`, cancelar, `/health/ready`, `/docs`; estados ⬜ → ✅.
  - `docs/02` y `docs/03`: estados de RF-AUT-01..05, RF-COM-01..02, RNF-SEG-03/04/08, RNF-OBS-01/02.
  - `docs/04`: estructura de código real y dos procesos.
  - `docs/08`: Sprint 1 ✅.
  - `docs/09`: D56–D60.
  - `CLAUDE.md` y `backend/README.md`: comandos reales y web en el puerto 3001.
- **Commits** por bloque (configuración, esquema, lógica en DB, auth, pedidos, colas, observabilidad, Docker, docs),
  sin línea de coautor. Push y PR solo cuando el usuario lo pida.

## 10. Fuera de alcance

Catálogo público, pagos y comprobantes, R2, revelar clave, `POST /auth/google`, verificación de correo, límite de
monto para clientes nuevos, CRUD admin, inventario y lotes por API, reclamos, soporte, reseñas, reportes, Resend,
Bull Board, Sentry, CI y despliegue real.
