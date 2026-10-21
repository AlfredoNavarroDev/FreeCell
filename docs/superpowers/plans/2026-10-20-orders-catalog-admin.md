# Pedidos con seguimiento/reveal + CRUD admin de catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos piezas independientes del Sprint 2, ambas ya `⬜` en `docs/08`:
1. **"Mis pedidos" completo** (RF-PED-01..04): listar pedidos propios paginados, enriquecer el detalle con estado del pago y línea de seguimiento, y revelar la clave de un pedido `DELIVERED` con auditoría y límite de uso.
2. **CRUD admin de catálogo** (RF-ADM-40/D38): categorías, productos (incl. `requiresToolUsername`) y planes con precios por moneda (D61), auditado.

**Architecture:**
- `OrdersService`/`OrdersController` ganan `GET /orders` (lista) y el `GET /orders/:id` existente se enriquece (no cambia de ruta) con `paymentStatus`/`paymentRejectionReason`/`tracking` en `OrderResponseDto` — campos nuevos, opcionales en tiempo de ejecución (si no hay pago asociado, van en `null`); los flujos que ya llaman `OrderResponseDto.from(order, items)` sin pago (crear, cancelar, upload-url, submit-payment) no cambian. `POST /orders/:id/license/reveal` es nuevo, decodifica con `CryptoService` (ya existe, Sprint 1) y audita.
- Catálogo admin: módulo nuevo `catalog-admin` (sibling de `catalog`, que sigue siendo de solo lectura) con tres pares controller+service (categorías, productos, planes), todos bajo `@Roles(Role.ADMIN)` (mismo patrón que `payment-methods`, Sprint 2 anterior). "Eliminar" un producto o plan es **desactivar** (`active: false`, ya filtran por eso las lecturas públicas); solo categorías admiten `DELETE` real (sin FK `RESTRICT` que lo bloquee; `products.categoryId` tiene `onDelete: 'SET NULL'`).

**Tech Stack:** NestJS 11, TypeORM 0.3, `@nestjs/throttler` 6.7 (`@Throttle()` por ruta, ya usado a nivel global en `app.module.ts`), Jest + Supertest (e2e reales, incluida concurrencia donde aplique).

**Spec:** `docs/02-requerimientos-funcionales.md` (RF-PED-01..04, RF-ADM-40), `docs/06-api.md` (filas `GET /orders`, `GET /orders/:id`, `POST /orders/:id/license/reveal`, CRUD `/admin/categories|products|plans`), `docs/09-decisiones-y-preguntas-abiertas.md` (D14, D29, D38, D58, D61; **D73 nueva en este plan**).

## Decisión nueva de este plan (para registrar en Task 4)

- **D73**: `POST /orders/:id/license/reveal` tiene un límite de uso propio, más estricto que el límite global (`@Throttle({ default: { limit: 20, ttl: 60_000 } })`, 20/min por IP, contra el 100/min global). _Razón:_ docs/06 ya pedía "con límite de uso" sin número; revelar una clave no debería ejecutarse en ráfaga (scraping de claves de varios pedidos), pero sí permitir ver/copiar varias veces durante una sesión normal de soporte al cliente.

## Global Constraints

- Entidades, rutas y código en **inglés**; mensajes al usuario y documentación en **español**.
- DTOs con `class-validator` (whitelist ya activado globalmente).
- `import type` para tipos puros; import de valor normal para lo inyectado por constructor DI.
- **No escribas manualmente un `catch` para violaciones de unicidad/trigger de Postgres** (`23505`, `23514`, `P0001`): `AllExceptionsFilter` ya las traduce a 409. Deja que esos errores salgan de `ds.transaction(...)` sin atraparlos (mismo patrón usado en el plan de `payments`, Sprint 2 anterior).
- Autorización por rol y por propiedad (regla 7): un pedido ajeno responde 404 (ya lo hace `findOwned`); las rutas `/admin/categories|products|plans` exigen `@Roles(Role.ADMIN)` (mismo patrón ya establecido por `/admin/payment-methods`).
- Toda mutación crítica audita (regla 6): **revelar clave** y **crear/editar categoría, producto o plan** (incluye cambios de precio) escriben `audit_logs` dentro de la misma transacción que la mutación, con `AuditService.log(manager, ...)`.
- Las claves **nunca** se registran en logs/errores/listados (regla 4): el valor descifrado solo va en el body de la respuesta de `reveal`, nunca en el `meta` de `audit_logs` (el audit log de reveal solo guarda `licenseCount`, nunca la clave).
- "Eliminar" producto o plan = `active: false` vía `PATCH` (no hay ruta `DELETE` para esos dos recursos: `plans`→`license_items` y `products`→`plans` tienen FK `RESTRICT`, un `DELETE` real fallaría o rompería pedidos históricos). Categorías sí tienen `DELETE` real.
- `npm run typecheck && npm test && npm run test:e2e` deben pasar en verde al final de cada tarea.
- Entorno de este worktree: Postgres en `localhost:5433`, Redis en `localhost:6380` (proyecto Docker `freecell-orders-catalog`, aislado de `main` y de otros worktrees). `npm run test:e2e` necesita el prefijo en el mismo comando:
  ```bash
  TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e
  ```
  Baseline verificada en este worktree (2026-10-20): `npm run typecheck` limpio; `npm test` 39/39; `npm run test:e2e` 13 suites / 111 pruebas, todas en verde.
- **Nunca** corras `docker compose up` sin verificar antes que `backend/.env` de este worktree tenga `COMPOSE_PROJECT_NAME=freecell-orders-catalog` — si faltara, pisarías los contenedores de main o de otro worktree (ya pasó una vez en este proyecto). El `.env` de este worktree ya lo tiene.

---

## Mapa de archivos

```
backend/
  src/
    orders/
      dto/
        order-response.dto.ts        Modificar: + paymentStatus, paymentRejectionReason, tracking
        list-orders-query.dto.ts     Crear
        revealed-license.dto.ts      Crear
      orders.service.ts              Modificar: + listForUser, revealLicenses; findForUser enriquecido
      orders.controller.ts           Modificar: + GET '', POST ':id/license/reveal'
    catalog-admin/
      catalog-admin.module.ts        Crear
      categories-admin.controller.ts Crear
      categories-admin.service.ts    Crear
      products-admin.controller.ts   Crear
      products-admin.service.ts      Crear
      plans-admin.controller.ts      Crear
      plans-admin.service.ts         Crear
      dto/
        create-category.dto.ts       Crear
        update-category.dto.ts       Crear
        create-product.dto.ts        Crear
        update-product.dto.ts        Crear
        create-plan.dto.ts           Crear
        update-plan.dto.ts           Crear
        plan-price-input.dto.ts      Crear
        category-admin-response.dto.ts  Crear
        product-admin-response.dto.ts   Crear
        plan-admin-response.dto.ts       Crear
    app.module.ts                    Modificar: importa CatalogAdminModule
  test/
    orders-list-detail.e2e-spec.ts   Crear
    license-reveal.e2e-spec.ts       Crear
    catalog-admin.e2e-spec.ts        Crear
docs/
  02-requerimientos-funcionales.md              Modificar: RF-PED-01..04, RF-ADM-40
  06-api.md                                     Modificar: filas de orders/admin catálogo
  08-plan-de-sprints.md                         Modificar: checkboxes
  09-decisiones-y-preguntas-abiertas.md         Modificar: + D73
```

---

### Task 1: `GET /orders` (lista) + enriquecer `GET /orders/:id` (RF-PED-01/02)

**Files:**
- Create: `backend/src/orders/dto/list-orders-query.dto.ts`
- Modify: `backend/src/orders/dto/order-response.dto.ts`
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.controller.ts`
- Create: `backend/test/orders-list-detail.e2e-spec.ts`

**Interfaces:**
- Produces: `OrdersService.listForUser(userId, dto): Promise<PaginatedResponseDto<OrderResponseDto>>`, `OrderResponseDto.from(order, items, latestPayment?)` con firma extendida (retrocompatible: tercer parámetro opcional).
- No depende de Task 2 ni de Task 3.

- [ ] **Step 1: DTO de query**

Crea `backend/src/orders/dto/list-orders-query.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { OrderStatus } from '../../database/enums';

export class ListOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsIn(Object.values(OrderStatus), { message: 'status no es un estado válido' })
  status?: OrderStatus;
}
```

- [ ] **Step 2: Enriquecer `OrderResponseDto`**

En `backend/src/orders/dto/order-response.dto.ts`, agrega el import de `Payment` y `PaymentStatus`:

```typescript
import { Order, OrderItem, Payment } from '../../database/entities';
import { OrderStatus, PaymentStatus } from '../../database/enums';
```

Agrega la clase de seguimiento y los campos nuevos a `OrderResponseDto`:

```typescript
export class OrderTrackingDto {
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) paymentApprovedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) deliveredAt!: Date | null;
}
```

```typescript
  @ApiProperty({ enum: PaymentStatus, nullable: true })
  paymentStatus!: PaymentStatus | null;

  @ApiProperty({ type: String, nullable: true })
  paymentRejectionReason!: string | null;

  @ApiProperty({ type: OrderTrackingDto })
  tracking!: OrderTrackingDto;
```

(Agrega estos tres campos nuevos a la clase `OrderResponseDto` ya existente, después de `items`.)

Cambia la firma y el cuerpo de `from`:

```typescript
  static from(
    order: Order,
    items: OrderItem[],
    latestPayment?: Payment | null,
  ): OrderResponseDto {
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
        .map((item) => ({
          planId: item.planId,
          unitPriceCents: item.unitPriceCents,
        })),
      paymentStatus: latestPayment?.status ?? null,
      paymentRejectionReason:
        latestPayment?.status === PaymentStatus.REJECTED
          ? latestPayment.rejectionReason
          : null,
      tracking: {
        createdAt: order.createdAt,
        paymentApprovedAt:
          latestPayment?.status === PaymentStatus.APPROVED
            ? latestPayment.reviewedAt
            : null,
        deliveredAt:
          order.status === OrderStatus.DELIVERED ? order.updatedAt : null,
      },
    };
  }
```

- [ ] **Step 3: Escribir el e2e (debe fallar: `GET /orders` no existe, el detalle no trae `tracking`)**

Crea `backend/test/orders-list-detail.e2e-spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OrderStatus, PaymentStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import {
  createCatalog,
  createPaymentMethod,
  createUser,
  insertOrder,
} from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('GET /orders y GET /orders/:id enriquecido', () => {
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

  it('lista solo los pedidos propios, paginados, más recientes primero', async () => {
    const user = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 3 });
    const mine1 = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });
    const mine2 = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });
    await insertOrder(ds, {
      userId: stranger.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    const body = res.body as { items: { id: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.items.map((o) => o.id).sort()).toEqual(
      [mine1.orderId, mine2.orderId].sort(),
    );
  });

  it('filtra por status', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });
    await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .get('/orders?status=IN_REVIEW')
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    const body = res.body as { items: { status: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe(OrderStatus.IN_REVIEW);
  });

  it('el detalle incluye el estado del pago y la línea de seguimiento', async () => {
    const user = await createUser(ds);
    const method = await createPaymentMethod(ds, { currencies: ['PEN'] });
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
      status: OrderStatus.IN_REVIEW,
    });
    const reviewedAt = new Date();
    await ds.query(
      `INSERT INTO payments ("orderId", "paymentMethodId", "operationNumber", "proofKey", "proofHash", "legalDeclarationAcceptedAt", status, "reviewedAt")
       VALUES ($1, $2, 'op-1', 'proofs/x.png', md5(random()::text) || md5(random()::text), now(), $3, $4)`,
      [orderId, method.id, PaymentStatus.APPROVED, reviewedAt],
    );

    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    const body = res.body as {
      paymentStatus: string;
      tracking: { createdAt: string; paymentApprovedAt: string | null };
    };
    expect(body.paymentStatus).toBe(PaymentStatus.APPROVED);
    expect(body.tracking.paymentApprovedAt).not.toBeNull();
    expect(body.tracking.createdAt).toBeTruthy();
  });

  it('el detalle sin pago asociado trae paymentStatus null', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    const body = res.body as { paymentStatus: string | null };
    expect(body.paymentStatus).toBeNull();
  });

  it('responde 401 sin sesión en la lista', async () => {
    const res = await request(app.getHttpServer()).get('/orders');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Correr el e2e y verificar que falla**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- orders-list-detail.e2e-spec.ts`
Expected: FAIL (`GET /orders` no existe; `paymentStatus`/`tracking` no están en la respuesta).

- [ ] **Step 5: `OrdersService.listForUser` y `findForUser` enriquecido**

En `backend/src/orders/orders.service.ts`, agrega los imports:

```typescript
import { In } from 'typeorm';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
```

(`Payment` ya se importa de `'../database/entities'` desde la Task 2 del plan de `payments` — agrégalo a esa misma línea de import si no está.)

Reemplaza `findForUser` por:

```typescript
  async findForUser(
    userId: string,
    orderId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.findOwned(userId, orderId);
    const payment = await this.latestPayment(order.id);
    return OrderResponseDto.from(order, order.items ?? [], payment);
  }

  async listForUser(
    userId: string,
    dto: ListOrdersQueryDto,
  ): Promise<PaginatedResponseDto<OrderResponseDto>> {
    const [orders, total] = await this.ds.getRepository(Order).findAndCount({
      where: { userId, ...(dto.status ? { status: dto.status } : {}) },
      relations: { items: true },
      order: { createdAt: 'DESC' },
      skip: (dto.page - 1) * dto.pageSize,
      take: dto.pageSize,
    });
    const paymentsByOrder = await this.latestPaymentsByOrder(
      orders.map((order) => order.id),
    );
    const items = orders.map((order) =>
      OrderResponseDto.from(
        order,
        order.items ?? [],
        paymentsByOrder.get(order.id) ?? null,
      ),
    );
    return PaginatedResponseDto.from(items, total, dto.page, dto.pageSize);
  }
```

Agrega los dos helpers privados, cerca de `findOwned`:

```typescript
  private async latestPayment(orderId: string): Promise<Payment | null> {
    return this.ds.getRepository(Payment).findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Filas ya vienen ordenadas DESC global: la primera que aparece por orderId es la más reciente. */
  private async latestPaymentsByOrder(
    orderIds: string[],
  ): Promise<Map<string, Payment>> {
    const map = new Map<string, Payment>();
    if (orderIds.length === 0) return map;
    const rows = await this.ds.getRepository(Payment).find({
      where: { orderId: In(orderIds) },
      order: { createdAt: 'DESC' },
    });
    for (const row of rows) {
      if (!map.has(row.orderId)) map.set(row.orderId, row);
    }
    return map;
  }
```

- [ ] **Step 6: Ruta en el controller**

En `backend/src/orders/orders.controller.ts`, agrega el import:

```typescript
import { Query } from '@nestjs/common';
```

(añádelo a la línea de import existente de `@nestjs/common`, no una línea nueva) y:

```typescript
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
```

Agrega el método, **antes** de `findOne(...)` (por legibilidad REST: lista antes que detalle):

```typescript
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: ListOrdersQueryDto,
  ): Promise<PaginatedResponseDto<OrderResponseDto>> {
    return this.orders.listForUser(user.id, dto);
  }
```

- [ ] **Step 7: Correr el e2e nuevo y verificar que pasa**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- orders-list-detail.e2e-spec.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 8: Regresión completa**

Run: `npm run typecheck && npm test && TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e`
Expected: todo en verde — en particular que los e2e de `orders`, `submit-payment` y `payment-upload-url` (que llaman `OrderResponseDto.from` sin el tercer parámetro) sigan pasando.

- [ ] **Step 9: Commit**

```bash
git add backend/src/orders backend/test/orders-list-detail.e2e-spec.ts
git commit -m "Backend: GET /orders paginado y detalle con estado de pago/seguimiento (RF-PED-01/02)"
```

---

### Task 2: `POST /orders/:id/license/reveal` (RF-PED-03/04, D73)

**Files:**
- Create: `backend/src/orders/dto/revealed-license.dto.ts`
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.controller.ts`
- Create: `backend/test/license-reveal.e2e-spec.ts`

**Interfaces:**
- Produces: `OrdersService.revealLicenses(user, orderId): Promise<RevealedLicenseDto[]>`.
- No depende de Task 1 ni de Task 3 (toca los mismos archivos `orders.service.ts`/`orders.controller.ts` que Task 1, así que estas dos tareas van **en secuencia**, no en paralelo).

- [ ] **Step 1: DTO de respuesta**

Crea `backend/src/orders/dto/revealed-license.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class RevealedLicenseDto {
  @ApiProperty() orderItemId!: string;
  @ApiProperty() planId!: string;
  @ApiProperty({ description: 'Clave en claro (regla 4: nunca se audita este valor)' })
  secret!: string;
}
```

- [ ] **Step 2: Escribir el e2e (debe fallar: la ruta no existe)**

Crea `backend/test/license-reveal.e2e-spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OrderStatus } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser, insertOrder } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('POST /orders/:id/license/reveal', () => {
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

  /** `insertOrder` reserva (RESERVED); para "entregado" hace falta marcar la licencia SOLD. */
  async function markDelivered(orderId: string, licenseIds: string[]) {
    await ds.query(
      `UPDATE orders SET status = 'DELIVERED' WHERE id = $1`,
      [orderId],
    );
    await ds.query(
      `UPDATE license_items SET status = 'SOLD', "soldAt" = now() WHERE id = ANY($1::uuid[])`,
      [licenseIds],
    );
  }

  it('revela la(s) clave(s) de un pedido entregado y audita', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        {
          planId: catalog.plan.id,
          unitPriceCents: 1000,
          licenseId: catalog.licenseIds[0],
        },
      ],
    });
    await markDelivered(orderId, catalog.licenseIds);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(200);
    const body = res.body as { planId: string; secret: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].planId).toBe(catalog.plan.id);
    expect(typeof body[0].secret).toBe('string');
    expect(body[0].secret.length).toBeGreaterThan(0);

    const logs: { action: string; meta: Record<string, unknown> }[] =
      await ds.query(
        `SELECT action, meta FROM audit_logs WHERE entity = 'order' AND "entityId" = $1 AND action = 'license.revealed'`,
        [orderId],
      );
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].meta)).not.toContain(body[0].secret);
  });

  it('revela varias claves si el pedido tiene varios ítems (D30)', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 2 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [
        { planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] },
        { planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[1] },
      ],
    });
    await markDelivered(orderId, catalog.licenseIds);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    const body = res.body as { secret: string }[];
    expect(body).toHaveLength(2);
    expect(body[0].secret).not.toBe(body[1].secret);
  });

  it('responde 409 si el pedido no está entregado', async () => {
    const user = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: user.id,
      currency: 'PEN',
      lines: [{ planId: catalog.plan.id, unitPriceCents: 1000 }],
    });

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(user)}`);

    expect(res.status).toBe(409);
  });

  it('responde 404 si el pedido es de otro cliente', async () => {
    const owner = await createUser(ds);
    const stranger = await createUser(ds);
    const catalog = await createCatalog(ds, { stock: 1 });
    const { orderId } = await insertOrder(ds, {
      userId: owner.id,
      currency: 'PEN',
      lines: [
        { planId: catalog.plan.id, unitPriceCents: 1000, licenseId: catalog.licenseIds[0] },
      ],
    });
    await markDelivered(orderId, catalog.licenseIds);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/license/reveal`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`);

    expect(res.status).toBe(404);
  });

  it('responde 401 sin sesión', async () => {
    const res = await request(app.getHttpServer()).post(
      `/orders/00000000-0000-0000-0000-000000000000/license/reveal`,
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Correr el e2e y verificar que falla**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- license-reveal.e2e-spec.ts`
Expected: FAIL (404, la ruta no existe).

- [ ] **Step 4: `OrdersService.revealLicenses`**

En `backend/src/orders/orders.service.ts`, agrega el import:

```typescript
import { CryptoService } from '../common/crypto/crypto.service';
import { RevealedLicenseDto } from './dto/revealed-license.dto';
```

Agrega `crypto` al constructor (8.º parámetro, al final):

```typescript
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly queue: OrdersQueueService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
  ) {}
```

Agrega el método nuevo, después de `submitPayment(...)`:

```typescript
  /**
   * RF-PED-03/04: solo pedidos DELIVERED; cada llamada se audita (quién, cuándo, cuántas claves),
   * **nunca** la clave en sí (regla 4). Devuelve todas las licencias SOLD del pedido (D30: carrito con
   * varios ítems). Límite de uso vía @Throttle en el controller (D73).
   */
  async revealLicenses(
    user: AuthenticatedUser,
    orderId: string,
  ): Promise<RevealedLicenseDto[]> {
    const order = await this.findOwned(user.id, orderId);
    if (order.status !== OrderStatus.DELIVERED) {
      throw new ConflictException(
        'Solo puedes revelar la clave de un pedido entregado',
      );
    }

    const rows: {
      orderItemId: string;
      planId: string;
      secretEncrypted: string;
    }[] = await this.ds.query(
      `SELECT li."orderItemId", oi."planId", li."secretEncrypted"
         FROM license_items li
         JOIN order_items oi ON oi.id = li."orderItemId"
        WHERE oi."orderId" = $1 AND li.status = 'SOLD'`,
      [order.id],
    );

    const revealed: RevealedLicenseDto[] = rows.map((row) => ({
      orderItemId: row.orderItemId,
      planId: row.planId,
      secret: this.crypto.decrypt(row.secretEncrypted),
    }));

    await this.ds.transaction(async (m) => {
      await this.audit.log(m, {
        actorId: user.id,
        action: 'license.revealed',
        entity: 'order',
        entityId: order.id,
        meta: { licenseCount: revealed.length },
      });
    });

    return revealed;
  }
```

- [ ] **Step 5: Ruta en el controller, con límite de uso (D73)**

En `backend/src/orders/orders.controller.ts`, agrega los imports:

```typescript
import { Throttle } from '@nestjs/throttler';
import { RevealedLicenseDto } from './dto/revealed-license.dto';
```

Agrega el método, después de `submitPayment(...)`:

```typescript
  @Post(':id/license/reveal')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  revealLicenses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RevealedLicenseDto[]> {
    return this.orders.revealLicenses(user, id);
  }
```

- [ ] **Step 6: Correr el e2e nuevo y verificar que pasa**

Run: `TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- license-reveal.e2e-spec.ts`
Expected: PASS (5 pruebas).

- [ ] **Step 7: Regresión completa**

Run: `npm run typecheck && npm test && TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add backend/src/orders backend/test/license-reveal.e2e-spec.ts
git commit -m "Backend: POST /orders/:id/license/reveal con auditoría y límite de uso (RF-PED-03/04, D73)"
```

---

### Task 3: CRUD admin de catálogo — categorías, productos, planes (RF-ADM-40/D38)

**Files:**
- Create: `backend/src/catalog-admin/catalog-admin.module.ts`
- Create: `backend/src/catalog-admin/categories-admin.controller.ts`
- Create: `backend/src/catalog-admin/categories-admin.service.ts`
- Create: `backend/src/catalog-admin/products-admin.controller.ts`
- Create: `backend/src/catalog-admin/products-admin.service.ts`
- Create: `backend/src/catalog-admin/plans-admin.controller.ts`
- Create: `backend/src/catalog-admin/plans-admin.service.ts`
- Create: `backend/src/catalog-admin/dto/create-category.dto.ts`
- Create: `backend/src/catalog-admin/dto/update-category.dto.ts`
- Create: `backend/src/catalog-admin/dto/category-admin-response.dto.ts`
- Create: `backend/src/catalog-admin/dto/create-product.dto.ts`
- Create: `backend/src/catalog-admin/dto/update-product.dto.ts`
- Create: `backend/src/catalog-admin/dto/product-admin-response.dto.ts`
- Create: `backend/src/catalog-admin/dto/plan-price-input.dto.ts`
- Create: `backend/src/catalog-admin/dto/create-plan.dto.ts`
- Create: `backend/src/catalog-admin/dto/update-plan.dto.ts`
- Create: `backend/src/catalog-admin/dto/plan-admin-response.dto.ts`
- Modify: `backend/src/app.module.ts`
- Create: `backend/test/catalog-admin.e2e-spec.ts`

**Interfaces:** ninguna consumida por otras tareas de este plan; no depende de Task 1 ni Task 2 (archivos sin solape: `src/orders/**` vs `src/catalog-admin/**`). Puede implementarse en paralelo con Task 1/2 **excepto** que comparten la misma base de pruebas e2e — este plan las deja en secuencia para no correr `test:e2e` dos veces a la vez contra la misma base.

- [ ] **Step 1: DTOs de categorías**

Crea `backend/src/catalog-admin/dto/category-admin-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../../database/entities';

export class CategoryAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;

  static from(entity: Category): CategoryAdminResponseDto {
    return { id: entity.id, name: entity.name };
  }
}
```

Crea `backend/src/catalog-admin/dto/create-category.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 80, { message: 'name admite hasta 80 caracteres' })
  name!: string;
}
```

Crea `backend/src/catalog-admin/dto/update-category.dto.ts`:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 80, { message: 'name admite hasta 80 caracteres' })
  name?: string;
}
```

- [ ] **Step 2: `CategoriesAdminService` + controller**

Crea `backend/src/catalog-admin/categories-admin.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Category } from '../database/entities';
import { CategoryAdminResponseDto } from './dto/category-admin-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<CategoryAdminResponseDto[]> {
    const rows = await this.ds
      .getRepository(Category)
      .find({ order: { name: 'ASC' } });
    return rows.map((row) => CategoryAdminResponseDto.from(row));
  }

  async create(
    admin: AuthenticatedUser,
    dto: CreateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    const created = await this.ds.transaction(async (m) => {
      const row = await m.save(Category, m.create(Category, dto));
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'category.created',
        entity: 'category',
        entityId: row.id,
        meta: { name: row.name },
      });
      return row;
    });
    return CategoryAdminResponseDto.from(created);
  }

  async update(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    const current = await this.ds.getRepository(Category).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Categoría no encontrada');
    }
    const updated = await this.ds.transaction(async (m) => {
      await m.update(Category, { id }, dto);
      const row = await m.findOneByOrFail(Category, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'category.updated',
        entity: 'category',
        entityId: id,
        meta: dto as Record<string, unknown>,
      });
      return row;
    });
    return CategoryAdminResponseDto.from(updated);
  }

  async remove(admin: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.ds.getRepository(Category).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Categoría no encontrada');
    }
    await this.ds.transaction(async (m) => {
      await m.delete(Category, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'category.deleted',
        entity: 'category',
        entityId: id,
        meta: { name: current.name },
      });
    });
  }
}
```

Crea `backend/src/catalog-admin/categories-admin.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { CategoriesAdminService } from './categories-admin.service';
import { CategoryAdminResponseDto } from './dto/category-admin-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/categories')
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesAdminService) {}

  @Get()
  list(): Promise<CategoryAdminResponseDto[]> {
    return this.categories.list();
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    return this.categories.create(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryAdminResponseDto> {
    return this.categories.update(admin, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.categories.remove(admin, id);
  }
}
```

- [ ] **Step 3: DTOs de productos**

Crea `backend/src/catalog-admin/dto/product-admin-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Product } from '../../database/entities';

export class ProductAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) categoryId!: string | null;
  @ApiProperty() requiresToolUsername!: boolean;
  @ApiProperty() active!: boolean;

  static from(entity: Product): ProductAdminResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      categoryId: entity.categoryId,
      requiresToolUsername: entity.requiresToolUsername,
      active: entity.active,
    };
  }
}
```

Crea `backend/src/catalog-admin/dto/create-product.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 120, { message: 'name admite hasta 120 caracteres' })
  name!: string;

  @ApiProperty()
  @IsString({ message: 'slug debe ser texto' })
  @Matches(/^[a-z0-9-]{1,140}$/, {
    message: 'slug solo admite minúsculas, números y guiones',
  })
  slug!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all', { message: 'categoryId debe ser un UUID' })
  categoryId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'requiresToolUsername debe ser verdadero o falso' })
  requiresToolUsername?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'description debe ser texto' })
  description?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;
}
```

Crea `backend/src/catalog-admin/dto/update-product.dto.ts` — mismos campos, todos opcionales (sigue el mismo patrón que `UpdatePaymentMethodDto` del plan de `payments`, no uses `PartialType`):

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'name debe ser texto' })
  @Length(1, 120, { message: 'name admite hasta 120 caracteres' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'slug debe ser texto' })
  @Matches(/^[a-z0-9-]{1,140}$/, {
    message: 'slug solo admite minúsculas, números y guiones',
  })
  slug?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('all', { message: 'categoryId debe ser un UUID' })
  categoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'requiresToolUsername debe ser verdadero o falso' })
  requiresToolUsername?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString({ message: 'description debe ser texto' })
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;
}
```

- [ ] **Step 4: `ProductsAdminService` + controller**

Crea `backend/src/catalog-admin/products-admin.service.ts` (mismo patrón que `CategoriesAdminService`; `remove` no existe — "eliminar" es `active: false` vía `update`):

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Product } from '../database/entities';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductAdminResponseDto } from './dto/product-admin-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ProductAdminResponseDto[]> {
    const rows = await this.ds
      .getRepository(Product)
      .find({ order: { name: 'ASC' } });
    return rows.map((row) => ProductAdminResponseDto.from(row));
  }

  async create(
    admin: AuthenticatedUser,
    dto: CreateProductDto,
  ): Promise<ProductAdminResponseDto> {
    const created = await this.ds.transaction(async (m) => {
      const row = await m.save(
        Product,
        m.create(Product, {
          name: dto.name,
          slug: dto.slug,
          categoryId: dto.categoryId ?? null,
          requiresToolUsername: dto.requiresToolUsername ?? false,
          description: dto.description ?? null,
          active: dto.active ?? true,
        }),
      );
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'product.created',
        entity: 'product',
        entityId: row.id,
        meta: { name: row.name, slug: row.slug },
      });
      return row;
    });
    return ProductAdminResponseDto.from(created);
  }

  async update(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductAdminResponseDto> {
    const current = await this.ds.getRepository(Product).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Producto no encontrado');
    }
    const updated = await this.ds.transaction(async (m) => {
      await m.update(Product, { id }, dto);
      const row = await m.findOneByOrFail(Product, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'product.updated',
        entity: 'product',
        entityId: id,
        meta: dto as Record<string, unknown>,
      });
      return row;
    });
    return ProductAdminResponseDto.from(updated);
  }
}
```

Crea `backend/src/catalog-admin/products-admin.controller.ts`:

```typescript
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductAdminResponseDto } from './dto/product-admin-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsAdminService } from './products-admin.service';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/products')
export class ProductsAdminController {
  constructor(private readonly products: ProductsAdminService) {}

  @Get()
  list(): Promise<ProductAdminResponseDto[]> {
    return this.products.list();
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ProductAdminResponseDto> {
    return this.products.create(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductAdminResponseDto> {
    return this.products.update(admin, id, dto);
  }
}
```

- [ ] **Step 5: DTOs de planes (con precios, D61)**

Crea `backend/src/catalog-admin/dto/plan-price-input.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class PlanPriceInputDto {
  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES, { message: 'currency debe ser PEN o USD' })
  currency!: Currency;

  @ApiProperty({ minimum: 1 })
  @IsInt({ message: 'priceCents debe ser un número entero' })
  @Min(1, { message: 'priceCents debe ser mayor a 0' })
  priceCents!: number;
}
```

Crea `backend/src/catalog-admin/dto/plan-admin-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { Plan } from '../../database/entities';
import { PlanKind } from '../../database/enums';

export class PlanPriceResponseDto {
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() priceCents!: number;
}

export class PlanAdminResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PlanKind }) kind!: PlanKind;
  @ApiProperty() durationDays!: number;
  @ApiProperty() lowStockThreshold!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: [PlanPriceResponseDto] }) prices!: PlanPriceResponseDto[];

  static from(
    entity: Plan,
    prices: { currency: Currency; priceCents: number }[],
  ): PlanAdminResponseDto {
    return {
      id: entity.id,
      productId: entity.productId,
      name: entity.name,
      kind: entity.kind,
      durationDays: entity.durationDays,
      lowStockThreshold: entity.lowStockThreshold,
      active: entity.active,
      prices,
    };
  }
}
```

Crea `backend/src/catalog-admin/dto/create-plan.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlanKind } from '../../database/enums';
import { PlanPriceInputDto } from './plan-price-input.dto';

export class CreatePlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'productId debe ser un UUID' })
  productId!: string;

  @ApiProperty()
  @Length(1, 120, { message: 'name admite hasta 120 caracteres' })
  name!: string;

  @ApiPropertyOptional({ enum: PlanKind, default: PlanKind.NEW })
  @IsOptional()
  @IsIn(Object.values(PlanKind), { message: 'kind debe ser NEW o RENEWAL' })
  kind?: PlanKind;

  @ApiProperty({ minimum: 1 })
  @IsInt({ message: 'durationDays debe ser un número entero' })
  @Min(1, { message: 'durationDays debe ser mayor a 0' })
  durationDays!: number;

  @ApiPropertyOptional({ minimum: 0, default: 5 })
  @IsOptional()
  @IsInt({ message: 'lowStockThreshold debe ser un número entero' })
  @Min(0, { message: 'lowStockThreshold no puede ser negativo' })
  lowStockThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;

  @ApiProperty({ type: [PlanPriceInputDto] })
  @IsArray({ message: 'prices debe ser una lista' })
  @ArrayMinSize(1, { message: 'prices necesita al menos un precio' })
  @ArrayUnique((price: PlanPriceInputDto) => price.currency, {
    message: 'No repitas la misma moneda en prices',
  })
  @ValidateNested({ each: true })
  @Type(() => PlanPriceInputDto)
  prices!: PlanPriceInputDto[];
}
```

Crea `backend/src/catalog-admin/dto/update-plan.dto.ts` — igual, todos opcionales, sin `productId` (no tiene sentido mover un plan de producto en este alcance):

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlanKind } from '../../database/enums';
import { PlanPriceInputDto } from './plan-price-input.dto';

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Length(1, 120, { message: 'name admite hasta 120 caracteres' })
  name?: string;

  @ApiPropertyOptional({ enum: PlanKind })
  @IsOptional()
  @IsIn(Object.values(PlanKind), { message: 'kind debe ser NEW o RENEWAL' })
  kind?: PlanKind;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt({ message: 'durationDays debe ser un número entero' })
  @Min(1, { message: 'durationDays debe ser mayor a 0' })
  durationDays?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt({ message: 'lowStockThreshold debe ser un número entero' })
  @Min(0, { message: 'lowStockThreshold no puede ser negativo' })
  lowStockThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'active debe ser verdadero o falso' })
  active?: boolean;

  @ApiPropertyOptional({
    type: [PlanPriceInputDto],
    description:
      'Agrega o actualiza precios por moneda (upsert); no borra monedas omitidas',
  })
  @IsOptional()
  @IsArray({ message: 'prices debe ser una lista' })
  @ArrayMinSize(1, { message: 'prices necesita al menos un precio si se envía' })
  @ArrayUnique((price: PlanPriceInputDto) => price.currency, {
    message: 'No repitas la misma moneda en prices',
  })
  @ValidateNested({ each: true })
  @Type(() => PlanPriceInputDto)
  prices?: PlanPriceInputDto[];
}
```

- [ ] **Step 6: `PlansAdminService` + controller**

Crea `backend/src/catalog-admin/plans-admin.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Plan, PlanPrice } from '../database/entities';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanAdminResponseDto } from './dto/plan-admin-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansAdminService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(
    admin: AuthenticatedUser,
    dto: CreatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    const created = await this.ds.transaction(async (m) => {
      const plan = await m.save(
        Plan,
        m.create(Plan, {
          productId: dto.productId,
          name: dto.name,
          kind: dto.kind ?? undefined,
          durationDays: dto.durationDays,
          lowStockThreshold: dto.lowStockThreshold ?? undefined,
          active: dto.active ?? true,
        }),
      );
      for (const price of dto.prices) {
        await m.save(
          PlanPrice,
          m.create(PlanPrice, {
            planId: plan.id,
            currency: price.currency,
            priceCents: price.priceCents,
          }),
        );
      }
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'plan.created',
        entity: 'plan',
        entityId: plan.id,
        meta: { productId: plan.productId, prices: dto.prices },
      });
      return plan;
    });
    return PlanAdminResponseDto.from(created, dto.prices);
  }

  async update(
    admin: AuthenticatedUser,
    id: string,
    dto: UpdatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    const current = await this.ds.getRepository(Plan).findOneBy({ id });
    if (!current) {
      throw new NotFoundException('Plan no encontrado');
    }
    const { prices, ...fields } = dto;

    const updated = await this.ds.transaction(async (m) => {
      if (Object.keys(fields).length > 0) {
        await m.update(Plan, { id }, fields);
      }
      if (prices) {
        for (const price of prices) {
          await m.query(
            `INSERT INTO plan_prices ("planId", currency, "priceCents")
             VALUES ($1, $2, $3)
             ON CONFLICT ("planId", currency) DO UPDATE SET "priceCents" = EXCLUDED."priceCents"`,
            [id, price.currency, price.priceCents],
          );
        }
      }
      const row = await m.findOneByOrFail(Plan, { id });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'plan.updated',
        entity: 'plan',
        entityId: id,
        meta: { ...fields, prices: prices ?? undefined },
      });
      return row;
    });

    const priceRows: { currency: 'PEN' | 'USD'; priceCents: number }[] =
      await this.ds.query(
        `SELECT currency, "priceCents" FROM plan_prices WHERE "planId" = $1 ORDER BY currency`,
        [id],
      );
    return PlanAdminResponseDto.from(updated, priceRows);
  }
}
```

Crea `backend/src/catalog-admin/plans-admin.controller.ts`:

```typescript
import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlanAdminResponseDto } from './dto/plan-admin-response.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansAdminService } from './plans-admin.service';

@ApiTags('admin-catalog')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/plans')
export class PlansAdminController {
  constructor(private readonly plans: PlansAdminService) {}

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    return this.plans.create(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanAdminResponseDto> {
    return this.plans.update(admin, id, dto);
  }
}
```

- [ ] **Step 7: Módulo y registro en `app.module.ts`**

Crea `backend/src/catalog-admin/catalog-admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CategoriesAdminController } from './categories-admin.controller';
import { CategoriesAdminService } from './categories-admin.service';
import { PlansAdminController } from './plans-admin.controller';
import { PlansAdminService } from './plans-admin.service';
import { ProductsAdminController } from './products-admin.controller';
import { ProductsAdminService } from './products-admin.service';

@Module({
  controllers: [
    CategoriesAdminController,
    ProductsAdminController,
    PlansAdminController,
  ],
  providers: [CategoriesAdminService, ProductsAdminService, PlansAdminService],
})
export class CatalogAdminModule {}
```

En `backend/src/app.module.ts`, agrega el import y súmalo a `imports` (junto a `CatalogModule`):

```typescript
import { CatalogAdminModule } from './catalog-admin/catalog-admin.module';
```

```typescript
    CatalogModule,
    CatalogAdminModule,
    PaymentMethodsModule,
```

- [ ] **Step 8: Escribir el e2e**

Crea `backend/test/catalog-admin.e2e-spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PlanKind, Role } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('CRUD admin de catálogo', () => {
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

  describe('/admin/categories', () => {
    it('rechaza a un cliente (403)', async () => {
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const res = await request(app.getHttpServer())
        .get('/admin/categories')
        .set('Authorization', `Bearer ${tokenFor(customer)}`);
      expect(res.status).toBe(403);
    });

    it('crea, edita y borra una categoría, todo auditado', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });

      const created = await request(app.getHttpServer())
        .post('/admin/categories')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Antivirus' });
      expect(created.status).toBe(201);
      const categoryId = (created.body as { id: string }).id;

      const edited = await request(app.getHttpServer())
        .patch(`/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Antivirus Pro' });
      expect(edited.status).toBe(200);
      expect((edited.body as { name: string }).name).toBe('Antivirus Pro');

      const removed = await request(app.getHttpServer())
        .delete(`/admin/categories/${categoryId}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      expect(removed.status).toBe(204);

      const logs: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity = 'category' AND "entityId" = $1 ORDER BY "createdAt"`,
        [categoryId],
      );
      expect(logs.map((l) => l.action)).toEqual([
        'category.created',
        'category.updated',
        'category.deleted',
      ]);
    });

    it('responde 404 al editar una categoría inexistente', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .patch(`/admin/categories/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('/admin/products', () => {
    it('crea un producto con requiresToolUsername y lo desactiva editándolo', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });

      const created = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          name: '[Producto de prueba]',
          slug: 'producto-de-prueba',
          requiresToolUsername: true,
        });
      expect(created.status).toBe(201);
      const body = created.body as { id: string; requiresToolUsername: boolean };
      expect(body.requiresToolUsername).toBe(true);

      const deactivated = await request(app.getHttpServer())
        .patch(`/admin/products/${body.id}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ active: false });
      expect(deactivated.status).toBe(200);
      expect((deactivated.body as { active: boolean }).active).toBe(false);
    });

    it('rechaza un slug duplicado (409, vía índice único)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Uno', slug: 'slug-repetido' });

      const res = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: 'Dos', slug: 'slug-repetido' });

      expect(res.status).toBe(409);
    });
  });

  describe('/admin/plans', () => {
    it('crea un plan con precios en dos monedas y luego actualiza solo una (D61)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const product = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: '[Producto]', slug: 'producto-para-plan' });
      const productId = (product.body as { id: string }).id;

      const created = await request(app.getHttpServer())
        .post('/admin/plans')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          productId,
          name: '30 días',
          durationDays: 30,
          kind: PlanKind.NEW,
          prices: [
            { currency: 'PEN', priceCents: 1000 },
            { currency: 'USD', priceCents: 300 },
          ],
        });
      expect(created.status).toBe(201);
      const planId = (created.body as { id: string }).id;

      const updated = await request(app.getHttpServer())
        .patch(`/admin/plans/${planId}`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ prices: [{ currency: 'PEN', priceCents: 1200 }] });

      expect(updated.status).toBe(200);
      const body = updated.body as {
        prices: { currency: string; priceCents: number }[];
      };
      expect(body.prices).toEqual(
        expect.arrayContaining([
          { currency: 'PEN', priceCents: 1200 },
          { currency: 'USD', priceCents: 300 },
        ]),
      );

      const logs: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity = 'plan' AND "entityId" = $1`,
        [planId],
      );
      expect(logs.map((l) => l.action)).toContain('plan.updated');
    });

    it('rechaza un plan sin precios (400)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const product = await request(app.getHttpServer())
        .post('/admin/products')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ name: '[Producto 2]', slug: 'producto-sin-precios' });
      const productId = (product.body as { id: string }).id;

      const res = await request(app.getHttpServer())
        .post('/admin/plans')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ productId, name: 'x', durationDays: 30, prices: [] });

      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 9: Correr el e2e y verificar que falla primero, luego pasa**

Run (antes de los Steps 1-7 de código, ya debería fallar; después de implementarlos):
`TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- catalog-admin.e2e-spec.ts`
Expected: PASS (9 pruebas).

- [ ] **Step 10: Regresión completa**

Run: `npm run typecheck && npm test && TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e`
Expected: todo en verde.

- [ ] **Step 11: Commit**

```bash
git add backend/src/catalog-admin backend/src/app.module.ts backend/test/catalog-admin.e2e-spec.ts
git commit -m "Backend: CRUD admin de catálogo — categorías, productos, planes con precios (RF-ADM-40/D38/D61)"
```

---

### Task 4: Documentación

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md`
- Modify: `docs/06-api.md`
- Modify: `docs/08-plan-de-sprints.md`
- Modify: `docs/09-decisiones-y-preguntas-abiertas.md`

**Interfaces:** (ninguna — solo texto)

- [ ] **Step 1: Registrar D73**

En `docs/09-decisiones-y-preguntas-abiertas.md`, agrega una sección nueva después de la sección de D71/D72 (módulo payments):

```markdown
### Decisión de pedidos/reveal — Sprint 2 (2026-10-20)
| Id | Decisión | Razón |
|---|---|---|
| D73 | `POST /orders/:id/license/reveal` tiene límite de uso propio: 20 por minuto por IP (más estricto que el límite global de 100/min). | docs/06 ya pedía "con límite de uso" sin número; evita scraping en ráfaga de varios pedidos sin bloquear un uso normal de soporte. |
```

- [ ] **Step 2: Actualizar RF-PED-01..04 y RF-ADM-40**

En `docs/02-requerimientos-funcionales.md`, reemplaza las 4 filas:

```markdown
| RF-PED-01 | Listar mis pedidos con estado (Esperando pago, Pago en revisión, Entregado, Cancelado) y filtros. | M | ⬜ |
| RF-PED-02 | Ver el detalle de un pedido con línea de seguimiento (creado → pago aprobado → entregado). | M | ⬜ |
| RF-PED-03 | Ver la clave de un pedido entregado: oculta por defecto, con **Mostrar** y **Copiar**. | M | ⬜ |
| RF-PED-04 | **Cada vez que se revela la clave se registra en auditoría** (quién, cuándo). | M | ⬜ |
```

por:

```markdown
| RF-PED-01 | Listar mis pedidos con estado (Esperando pago, Pago en revisión, Entregado, Cancelado) y filtros. | M | ✅ (`GET /orders?status=`, paginado) |
| RF-PED-02 | Ver el detalle de un pedido con línea de seguimiento (creado → pago aprobado → entregado). | M | ✅ (`GET /orders/:id` con `tracking` y `paymentStatus`) |
| RF-PED-03 | Ver la clave de un pedido entregado: oculta por defecto, con **Mostrar** y **Copiar**. | M | 🟡 (`POST /orders/:id/license/reveal` ✅; falta el componente "Mostrar/Copiar" en la UI, Sprint 2 frontend) |
| RF-PED-04 | **Cada vez que se revela la clave se registra en auditoría** (quién, cuándo). | M | ✅ (`license.revealed`, D73) |
```

Y reemplaza:

```markdown
| RF-ADM-40 | CRUD completo de categorías, productos (incl. `requiresToolUsername`) y planes (nombre, duración, tipo, precio, moneda, umbral), **desde Sprint 2** (D38, adelantado de Sprint 3). | M | ⬜ |
```

por:

```markdown
| RF-ADM-40 | CRUD completo de categorías, productos (incl. `requiresToolUsername`) y planes (nombre, duración, tipo, precio, moneda, umbral), **desde Sprint 2** (D38, adelantado de Sprint 3). | M | 🟡 (API ✅ — `/admin/categories|products|plans`; falta la UI del panel admin, Sprint 2 frontend) |
```

- [ ] **Step 3: Marcar las filas de la API**

En `docs/06-api.md`, reemplaza:

```markdown
| ⬜ | `GET /orders?status=` | 👤 | Mis pedidos, paginado. |
| ⬜ | `GET /orders/:id` | 👤 | Detalle + línea de seguimiento + estado del pago. 404 si no es suyo. |
```

por:

```markdown
| ✅ | `GET /orders?status=` | 👤 | Mis pedidos, paginado (`page`/`pageSize`). |
| ✅ | `GET /orders/:id` | 👤 | Detalle + `tracking` (creado/pago aprobado/entregado) + `paymentStatus`. 404 si no es suyo. |
```

Reemplaza:

```markdown
| ⬜ | `POST /orders/:id/license/reveal` | 👤 | Devuelve la clave en claro **y registra auditoría**. Solo `DELIVERED`. Con límite de uso. |
```

por:

```markdown
| ✅ | `POST /orders/:id/license/reveal` | 👤 | Devuelve la(s) clave(s) en claro de las licencias `SOLD` del pedido **y registra auditoría** (`license.revealed`, nunca la clave). Solo `DELIVERED` (409 si no). Límite: 20/min por IP (D73). |
```

Revisa cómo está la línea exacta del bloque "Administración" (la fila de `POST /admin/payment-methods` del plan de `payments` ya quedó ahí como referencia de formato real — 3 columnas: estado | ruta | notas, sin columna de rol) y agrega, en ese mismo formato, estas filas nuevas:

```markdown
| ✅ | `GET /admin/categories` | Lista todas las categorías. |
| ✅ | `POST /admin/categories` | Crea una categoría; auditado. |
| ✅ | `PATCH /admin/categories/:id` | Edita el nombre; auditado. 404 si no existe. |
| ✅ | `DELETE /admin/categories/:id` | Borra la categoría (productos quedan sin categoría); auditado. 404 si no existe. |
| ✅ | `GET /admin/products` | Lista todos los productos, incluidos inactivos. |
| ✅ | `POST /admin/products` | Crea un producto (incl. `requiresToolUsername`); auditado. |
| ✅ | `PATCH /admin/products/:id` | Edita cualquier campo, incluida la desactivación (`active: false`); auditado. 404 si no existe. |
| ✅ | `POST /admin/plans` | Crea un plan con sus precios por moneda (D61); auditado. 400 sin precios. |
| ✅ | `PATCH /admin/plans/:id` | Edita campos y/o hace upsert de precios por moneda (no borra monedas omitidas); auditado. 404 si no existe. |
```

- [ ] **Step 4: Marcar los checkboxes del plan de sprints**

En `docs/08-plan-de-sprints.md`, reemplaza:

```markdown
- [ ] `GET /orders`, reveal de clave **con auditoría** (RF-PED-01..04); `GET /orders/:id` y cancelar ya implementados.
- [ ] CRUD admin de catálogo: productos (incl. `requiresToolUsername`), planes (con precios por moneda, D61),
      categorías (RF-ADM-40, D38).
```

por:

```markdown
- [x] `GET /orders`, reveal de clave **con auditoría** (RF-PED-01..04); `GET /orders/:id` y cancelar ya implementados.
- [x] CRUD admin de catálogo: productos (incl. `requiresToolUsername`), planes (con precios por moneda, D61),
      categorías (RF-ADM-40, D38).
```

- [ ] **Step 5: Commit**

```bash
git add docs/02-requerimientos-funcionales.md docs/06-api.md docs/08-plan-de-sprints.md docs/09-decisiones-y-preguntas-abiertas.md
git commit -m "Docs: pedidos con seguimiento/reveal y CRUD admin de catálogo — RF-PED-01..04, RF-ADM-40, D73"
```
