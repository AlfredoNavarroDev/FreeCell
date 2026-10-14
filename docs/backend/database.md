# Base de datos

**Archivos:** `src/database/entities/*.ts`, `src/database/migrations/1791847860562-InitialSchema.ts` (esquema),
`src/database/migrations/1791848504746-DatabaseLogic.ts` (triggers/vistas/funciones), `src/database/views/*.ts`,
`src/database/enums.ts`, `src/database/currency.ts`, `src/database/data-source*.ts`, `src/database/seed.ts`.
Pruebas: `test/schema.e2e-spec.ts` (verifica que existen las 19 tablas y las restricciones clave),
`test/db-logic.e2e-spec.ts` (triggers, vistas, funciones), `test/seed.e2e-spec.ts`.

Convenciones: PK `uuid` (`gen_random_uuid()`, extensión `pgcrypto`); fechas `timestamptz`; dinero en **céntimos
(int)**; moneda `char(3)` con `CHECK IN ('PEN','USD')` (`src/database/currency.ts`); `createdAt`/`updatedAt` en
las 14 tablas listadas en `UPDATED_AT_TABLES` (migración `DatabaseLogic`); las otras 5 (`audit_logs`,
`order_items`, `notification_logs`, `ticket_messages`, `refresh_tokens`) solo tienen `createdAt`.

## Las 19 tablas

| Tabla | Columnas clave |
|---|---|
| `users` | `email` único, `passwordHash` nullable (`select:false`, vacío en cuentas solo-Google futuras), `googleId` nullable único (`select:false`), `name`, `role` (`CUSTOMER`\|`ADMIN`, default `CUSTOMER`), `phone`, `emailVerifiedAt` |
| `categories` | `name` único |
| `products` | `name`, `slug` único, `description`, `active` (default true), `categoryId` (FK `SET NULL`), `requiresToolUsername` (default false) |
| `plans` | `productId` (FK `RESTRICT`), `name`, `kind` (`NEW`\|`RENEWAL`, default `NEW`), `durationDays`, `lowStockThreshold` (default 5), `active` (default true) — **sin** `priceCents` ni `currency` (viven en `plan_prices`, D61) |
| `plan_prices` | `planId` (FK `CASCADE`), `currency`, `priceCents`. Único `(planId, currency)` |
| `license_batches` | `planId` (FK `RESTRICT`), `supplier`, `unitCostCents`, `costCurrency` (default `USD`), `fxRatePen numeric(10,4)` nullable, `notes`, `purchasedAt` |
| `license_items` | `planId`/`batchId` (FK `RESTRICT`), `secretEncrypted` (`select:false`), `secretHash` único (`select:false`), `status` (`AVAILABLE`\|`RESERVED`\|`SOLD`\|`VOID`), `reservedUntil`, `orderItemId` nullable (FK `RESTRICT`), `soldAt`, `replacesId` nullable (self-FK `RESTRICT`) |
| `orders` | `orderNumber` (serie, única, arranca en 1001), `userId` (FK `RESTRICT`), `status`, `totalCents`, `currency`, `toolUsername`, `expiresAt`, `cancelReason` |
| `order_items` | `orderId` (FK `CASCADE`), `planId` (FK `RESTRICT`), `unitPriceCents` — sin `currency` propia, hereda la del pedido |
| `claims` | `orderId` (FK `RESTRICT`, agregada para el índice único parcial), `licenseItemId`/`userId` (FK `RESTRICT`), `reason`, `status` (`OPEN`\|`RESOLVED`\|`REJECTED`), `replacementLicenseId` nullable, `resolvedById` nullable, `resolvedAt` |
| `notification_logs` | `key` único, `channel`, `recipient`, `template` |
| `payment_methods` | `code` único, `name`, `kind` (`WALLET`\|`BANK_TRANSFER`\|`CRYPTO`), `currencies char(3)[]`, `instructions jsonb` (default `{}`), `active` (default true), `sortOrder` (default 0) |
| `payments` | `orderId`/`paymentMethodId` (FK `RESTRICT`), `operationNumber`, `proofKey`, `proofHash` único, `status` (`PENDING`\|`APPROVED`\|`REJECTED`), `rejectionReason`, `reviewedById` nullable, `reviewedAt`. Único `(paymentMethodId, operationNumber)` |
| `refresh_tokens` | `userId` (FK `CASCADE`), `tokenHash` único, `familyId`, `expiresAt`, `revokedAt` nullable, `revokedReason` (`ROTATED`\|`LOGOUT`\|`REUSE_DETECTED`, nullable), `replacedById` nullable |
| `reviews` | `productId`/`userId`/`orderId` (FK `RESTRICT`), `rating smallint` (`CHECK BETWEEN 1 AND 5`), `body`, `status` (`PENDING`\|`APPROVED`\|`HIDDEN`). Único `(orderId, productId)` |
| `settings` | `key` único, `value jsonb` |
| `support_tickets` | `userId` (FK `RESTRICT`), `subject`, `status` (`OPEN`\|`CLOSED`) |
| `ticket_messages` | `ticketId` (FK `CASCADE`), `authorId` (FK `RESTRICT`), `body`, `isAdmin` (default false) |
| `audit_logs` | `actorId` nullable **sin FK a propósito** (sobrevive si se borra el usuario), `action`, `entity`, `entityId`, `meta jsonb` nullable |

Entidades de solo lectura mapeadas con `@ViewEntity({ synchronize: false })` (no son tablas, no cuentan en las 19):
`PlanStockView` (`v_plan_stock`), `SalesLineView` (`v_sales_lines`).

## CHECK e índices parciales relevantes

- `users`: `CHK_users_credentials` → `passwordHash IS NOT NULL OR googleId IS NOT NULL` (invariante 10).
- `plan_prices`: `CHK_plan_prices_currency` (`PEN`/`USD`), `CHK_plan_prices_positive` (`priceCents > 0`).
- `license_batches`: `CHK_license_batches_fx` → si `costCurrency='USD'`, `fxRatePen` es obligatorio y `> 0`; si
  `costCurrency='PEN'`, `fxRatePen` debe ser `NULL` (D62).
- `license_items`: `CHK_license_items_state` → `AVAILABLE` exige `orderItemId IS NULL AND reservedUntil IS NULL`;
  `RESERVED`/`SOLD` exigen `orderItemId IS NOT NULL`; `VOID` no exige nada. Índice único parcial
  `UQ_license_items_active_order_item` en `orderItemId` `WHERE status IN ('RESERVED','SOLD')` (invariantes 1–2).
  Índice `(planId, status)` para contar/bloquear stock rápido.
- `orders`: índice `(status, expiresAt)` para que el barrido localice vencidos sin escanear todo.
- `claims`: índice único parcial `UQ_claims_one_open_per_order` en `orderId` `WHERE status='OPEN'` (invariante 6).
- `payments`: único `(paymentMethodId, operationNumber)` (D64: el mismo número de operación en métodos distintos no
  choca); único `proofHash`; único parcial `UQ_payments_one_pending_per_order` en `orderId` `WHERE status='PENDING'`.
- `payment_methods`: `CHK_payment_methods_currencies` (no vacío, subconjunto de `{PEN,USD}`),
  `CHK_payment_methods_crypto_usd` (`kind <> 'CRYPTO' OR currencies = ARRAY['USD']`).

## Lógica en base de datos (D57)

Migración `DatabaseLogic` (triggers, vistas y funciones, con `down()` completo). Defensa en profundidad: aunque un
servicio tenga un bug, Postgres no deja revender una licencia, saltar estados ni editar la auditoría.

### Triggers
| Trigger | Tabla / evento | Qué hace |
|---|---|---|
| `trg_set_updated_at` | `BEFORE UPDATE` en las 14 tablas con `updatedAt` | `NEW."updatedAt" := now()` |
| `trg_license_status_guard` | `BEFORE UPDATE OF status` en `license_items` | Solo permite `AVAILABLE→RESERVED`, `RESERVED→AVAILABLE`, `RESERVED→SOLD`, `SOLD→VOID`, `AVAILABLE→VOID`; cualquier otra combinación lanza `RAISE EXCEPTION ... ERRCODE='P0001'` |
| `trg_order_status_guard` | `BEFORE UPDATE OF status` en `orders` | Solo permite `PENDING_PAYMENT→IN_REVIEW\|CANCELLED`, `IN_REVIEW→DELIVERED\|PENDING_ACTIVATION\|PENDING_PAYMENT\|CANCELLED`, `PENDING_ACTIVATION→DELIVERED`; el resto, `P0001` |
| `trg_order_total_check` / `trg_order_items_total_check` | `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`, en `orders` y en `order_items` | Al hacer `COMMIT`, verifica `orders.totalCents = Σ order_items.unitPriceCents` del pedido; si no coincide, `P0001` (invariante 5) |
| `trg_audit_logs_immutable` | `BEFORE UPDATE OR DELETE` en `audit_logs` | Siempre lanza excepción: la tabla es de solo inserción |
| `trg_payment_method_currency` | `BEFORE INSERT OR UPDATE OF "paymentMethodId"` en `payments` | El método debe estar `active` y aceptar `orders.currency` del pedido asociado; si no, `P0001` (D63) |

### Vistas (solo lectura, ninguna expone `secretEncrypted` ni `secretHash`)
- **`v_plan_stock`**: por `planId`, cuenta `available`/`reserved`/`sold`/`void` y calcula `stockState`:
  `OUT_OF_STOCK` si `available = 0`, `LOW` si `available <= lowStockThreshold`, si no `IN_STOCK`.
- **`v_sales_lines`**: una fila por licencia `SOLD`, con `orderId`, `orderItemId`, `planId`, `productId`,
  `currency` (del pedido), `unitPriceCents`, `costCurrency`/`unitCostCents`/`fxRatePen` (del lote), `soldAt` y
  `marginCents` (D62):
  - misma moneda venta/costo → `unitPriceCents − unitCostCents`.
  - venta en `PEN` con costo en `USD` → `unitPriceCents − ROUND(unitCostCents × fxRatePen)`.
  - cualquier otra combinación (venta `USD` con costo `PEN`) → `NULL` (un lote en soles no guarda tasa).

### Funciones
- **`fn_release_order(p_order_id uuid, p_reason text, p_require_expired boolean) RETURNS boolean`**: bloquea el
  pedido (`FOR UPDATE`). Si no existe o no está `PENDING_PAYMENT`, devuelve `false` sin tocar nada. Si
  `p_require_expired` y `expiresAt > now()`, también `false`. En otro caso: pasa a `AVAILABLE` (limpiando
  `orderItemId`/`reservedUntil`) las licencias `RESERVED` del pedido, pasa el pedido a `CANCELLED` con
  `cancelReason = p_reason`, devuelve `true`. La usan el job `release`, el barrido (`p_require_expired = true`) y la
  cancelación del cliente (`false`). La auditoría la escribe quien llama, en la misma transacción.
- **`fn_release_expired() RETURNS SETOF uuid`**: recorre hasta 500 `orders` `PENDING_PAYMENT` con `expiresAt <= now()`
  (`FOR UPDATE SKIP LOCKED`, ordenados por `expiresAt`), llama `fn_release_order` sobre cada uno y devuelve los ids
  efectivamente liberados.

La migración también fija la secuencia de `orders.orderNumber` para que arranque en **1001** (incluso tras un
`TRUNCATE ... RESTART IDENTITY` en las pruebas).

## Cómo crear una migración nueva

1. Cambia la(s) entidad(es) en `src/database/entities/`.
2. `npm run migration:generate -- src/database/migrations/NombreDescriptivo` (usa `src/database/data-source.ts`,
   compara contra la base apuntada por `DATABASE_URL`).
3. Revisa el SQL generado — TypeORM no sabe de triggers/vistas/funciones escritas a mano: si tu cambio toca algo de
   `DatabaseLogic`, edita la migración nueva a mano (siguiendo el patrón `up()`/`down()` completo de esa migración).
4. `npm run migration:run`.
5. Nunca editar una migración ya aplicada (regla del proyecto); siempre una migración nueva.
