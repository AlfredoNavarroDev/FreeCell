# Inventario (S7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al admin una pantalla real en `/admin/inventario` para ver stock por plan, cargar lotes de licencias (con preview de duplicados), anular una licencia disponible y mantener la tasa USD→PEN usada para congelar el costo de los lotes en dólares.

**Architecture:** Backend: módulo nuevo `inventory/` (mismo patrón que `catalog-admin/` y `orders/admin-payments*`) que reutiliza la vista `v_plan_stock` (ya existe desde Fundaciones) para los conteos por plan, `CryptoService` (ya existe) para cifrar/hashear claves, `AuditService` (ya existe, global) para auditoría, y extiende `SettingsService` con lectura/escritura de `usdPenRate`. Ningún esquema nuevo — las tablas y triggers (`trg_license_status_guard`, `CHK_license_batches_fx`) ya existen desde Fundaciones y Postgres ya los hace cumplir; `AllExceptionsFilter` ya traduce cualquier violación (P0001/23505/23514) a 409 legible, así que el servicio no necesita capturarlas a mano. Frontend: página Server Component + un único client component (`InventoryScreen`) con totales, filtros client-side, filas expandibles (licencias disponibles + anular) y el panel de carga con preview debounced — mismo patrón de Server Actions que `admin-payments-client.ts`.

**Tech Stack:** NestJS + TypeORM + Postgres (backend, sin migración — todo el esquema ya existe); Next.js 16 App Router + TypeScript + Tailwind v4, Server Actions, Vitest, Playwright (frontend).

**Spec:** `docs/superpowers/specs/2026-11-07-inventario-design.md`

## Global Constraints

- Carga manual únicamente: una licencia por línea en un textarea. Sin CSV, sin input de archivo.
- Duplicados son **globales** (`secretHash` es `unique` en toda `license_items`), no por plan.
- `POST .../batches/preview` nunca persiste nada; `POST .../batches` revalida desde cero contra el estado real de la base (nunca confía en el resultado del preview del cliente).
- Moneda del costo: selector PEN/USD en el formulario de carga. La tasa USD→PEN es universal (`settings.usdPenRate`), no se tipea por lote; al crear un lote en USD, el backend lee la tasa vigente y la congela en `license_batches.fxRatePen` (D62: "el lote guarda el costo como se pagó").
- Sin paginación en `GET /admin/inventory` — la lista completa de planes siempre cabe en una pantalla.
- `GET /admin/inventory/plans/:planId/licenses` nunca expone `secretEncrypted` ni `secretHash` — solo `id` y `createdAt`.
- Anular licencia vive en una vista expandida de la fila del plan (no una pantalla/modal nueva).
- Entidades/rutas/código en inglés; mensajes al usuario y documentación en español.
- Dinero en céntimos enteros (`unitCostCents`); moneda `PEN`/`USD` (`CURRENCIES` de `database/currency.ts`).
- Toda mutación crítica (carga de lote, anular licencia, cambio de tasa) escribe `audit_logs` en la misma transacción (regla 6).
- Accesibilidad AA: objetivos ≥44px, el color nunca es el único indicador — reusar `<StockBadge>` (`frontend/src/components/stock-badge.tsx`), que ya cumple esto.
- Fuera de alcance (no tocar en este plan): alerta automática de stock bajo (`low-stock-check`, Sprint 4), pantalla genérica `/admin/settings`, carga por CSV, reportes de valor de inventario.

---

### Task 1: Backend — lectura de inventario (`GET /admin/inventory`, `GET /admin/inventory/plans/:planId/licenses`)

**Files:**
- Modify: `backend/src/settings/settings.service.ts`
- Create: `backend/src/inventory/inventory.module.ts`
- Create: `backend/src/inventory/inventory.controller.ts`
- Create: `backend/src/inventory/inventory.service.ts`
- Create: `backend/src/inventory/dto/inventory-item.dto.ts`
- Create: `backend/src/inventory/dto/available-license.dto.ts`
- Modify: `backend/src/app.module.ts`
- Create: `backend/test/inventory.e2e-spec.ts`

**Interfaces:**
- Consumes: vista `v_plan_stock` (`planId, available, reserved, sold, void, stockState`, ya existe); `SettingsService.getNumber` (ya existe, sin cambios); `AuditService.log` (global, sin cambios); `CryptoService` (global, no se usa en este task todavía).
- Produces: `SettingsService.getNumberOrNull(key, manager?): Promise<number | null>`; `InventoryItemDto { planId, productName, planName, lowStockThreshold, available, reserved, sold, status: StockState }`; `InventoryResponseDto { items: InventoryItemDto[], usdPenRate: number | null }`; `AvailableLicenseDto { id, createdAt }`; `InventoryService.list(): Promise<InventoryResponseDto>`; `InventoryService.listAvailableLicenses(planId): Promise<AvailableLicenseDto[]>` (usados por las Tasks 2 y 3 también).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/test/inventory.e2e-spec.ts`:

```ts
import { JwtService } from '@nestjs/jwt';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Role } from '../src/database/enums';
import { type User } from '../src/database/entities';
import { createCatalog, createUser } from './utils/factories';
import { createTestApp, resetState } from './utils/test-app';

describe('/admin/inventory', () => {
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

  describe('GET /admin/inventory', () => {
    it('rechaza a un cliente (403)', async () => {
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const res = await request(app.getHttpServer())
        .get('/admin/inventory')
        .set('Authorization', `Bearer ${tokenFor(customer)}`);
      expect(res.status).toBe(403);
    });

    it('responde 401 sin sesión', async () => {
      const res = await request(app.getHttpServer()).get('/admin/inventory');
      expect(res.status).toBe(401);
    });

    it('devuelve una fila por plan con conteos, umbral, estado y la tasa USD→PEN (null si no se configuró)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 2, lowStockThreshold: 5 });

      const res = await request(app.getHttpServer())
        .get('/admin/inventory')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        items: {
          planId: string;
          productName: string;
          planName: string;
          lowStockThreshold: number;
          available: number;
          reserved: number;
          sold: number;
          status: string;
        }[];
        usdPenRate: number | null;
      };
      const row = body.items.find((i) => i.planId === catalog.plan.id)!;
      expect(row).toEqual({
        planId: catalog.plan.id,
        productName: catalog.product.name,
        planName: catalog.plan.name,
        lowStockThreshold: 5,
        available: 2,
        reserved: 0,
        sold: 0,
        status: 'LOW',
      });
      expect(body.usdPenRate).toBeNull();
    });
  });

  describe('GET /admin/inventory/plans/:planId/licenses', () => {
    it('devuelve solo las licencias AVAILABLE, con id y fecha de carga, nunca la clave', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 3 });

      const res = await request(app.getHttpServer())
        .get(`/admin/inventory/plans/${catalog.plan.id}/licenses`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as { id: string; createdAt: string }[];
      expect(body).toHaveLength(3);
      expect(body.map((l) => l.id).sort()).toEqual(
        [...catalog.licenseIds].sort(),
      );
      for (const license of body) {
        expect(Object.keys(license).sort()).toEqual(['createdAt', 'id']);
      }
    });

    it('responde 404 si el plan no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .get(`/admin/inventory/plans/${randomUUID()}/licenses`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npm run test:e2e -- inventory`
Expected: FAIL — `Cannot find module '../src/inventory/...'` / 404 en todas las rutas (el módulo no existe todavía).

- [ ] **Step 3: Implementar**

Agregar a `backend/src/settings/settings.service.ts` (reemplazar el archivo completo):

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Setting } from '../database/entities';

export const SETTING_RESERVATION_TTL_MINUTES = 'reservationTtlMinutes';
export const SETTING_USD_PEN_RATE = 'usdPenRate';

/** D74: placeholder de negocio hasta que Joseph dé la cifra real. */
export const SETTING_NEW_CUSTOMER_GRACE_ORDERS = 'newCustomerGraceOrders';
export const SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_PEN =
  'newCustomerMaxOrderCentsPen';
export const SETTING_NEW_CUSTOMER_MAX_ORDER_CENTS_USD =
  'newCustomerMaxOrderCentsUsd';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    private readonly audit: AuditService,
  ) {}

  /** Lee un número de settings; si falta o no es número, devuelve `fallback`. */
  async getNumber(key: string, fallback: number): Promise<number> {
    const row = await this.settings.findOne({ where: { key } });
    return typeof row?.value === 'number' && Number.isFinite(row.value)
      ? row.value
      : fallback;
  }

  /** Igual que `getNumber`, pero `null` si nunca se configuró (en vez de un fallback indistinguible). */
  async getNumberOrNull(
    key: string,
    manager?: EntityManager,
  ): Promise<number | null> {
    const repo = manager ? manager.getRepository(Setting) : this.settings;
    const row = await repo.findOne({ where: { key } });
    return typeof row?.value === 'number' && Number.isFinite(row.value)
      ? row.value
      : null;
  }

  /** Upsert auditado (regla 6) de un número en settings. Reusa la transacción del llamador si se pasa `manager`. */
  async setNumber(
    key: string,
    value: number,
    actorId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const run = async (m: EntityManager): Promise<void> => {
      await m.getRepository(Setting).upsert({ key, value }, ['key']);
      await this.audit.log(m, {
        actorId,
        action: 'setting.updated',
        entity: 'setting',
        entityId: key,
        meta: { key, value },
      });
    };
    if (manager) {
      await run(manager);
    } else {
      await this.settings.manager.transaction(run);
    }
  }
}
```

Crear `backend/src/inventory/dto/inventory-item.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import type { StockState } from '../../database/views/plan-stock.view';

interface InventoryItemRow {
  planId: string;
  productName: string;
  planName: string;
  lowStockThreshold: number;
  available: number;
  reserved: number;
  sold: number;
  stockState: StockState;
}

/** Fila por plan de la pantalla de Inventario (S7). */
export class InventoryItemDto {
  @ApiProperty() planId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() lowStockThreshold!: number;
  @ApiProperty() available!: number;
  @ApiProperty() reserved!: number;
  @ApiProperty() sold!: number;
  @ApiProperty({ enum: ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'] })
  status!: StockState;

  static from(row: InventoryItemRow): InventoryItemDto {
    return {
      planId: row.planId,
      productName: row.productName,
      planName: row.planName,
      lowStockThreshold: row.lowStockThreshold,
      available: row.available,
      reserved: row.reserved,
      sold: row.sold,
      status: row.stockState,
    };
  }
}

export class InventoryResponseDto {
  @ApiProperty({ type: [InventoryItemDto] }) items!: InventoryItemDto[];
  @ApiProperty({ type: Number, nullable: true }) usdPenRate!: number | null;
}
```

Crear `backend/src/inventory/dto/available-license.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

/** Licencia AVAILABLE de un plan: nunca incluye la clave (regla 4). */
export class AvailableLicenseDto {
  @ApiProperty() id!: string;
  @ApiProperty() createdAt!: Date;
}
```

Crear `backend/src/inventory/inventory.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SettingsService, SETTING_USD_PEN_RATE } from '../settings/settings.service';
import { LicenseStatus } from '../database/enums';
import type { StockState } from '../database/views/plan-stock.view';
import {
  AvailableLicenseDto,
  InventoryItemDto,
  InventoryResponseDto,
} from './dto/inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly ds: DataSource,
    private readonly settings: SettingsService,
  ) {}

  async list(): Promise<InventoryResponseDto> {
    const rows: {
      planId: string;
      productName: string;
      planName: string;
      lowStockThreshold: number;
      available: number;
      reserved: number;
      sold: number;
      stockState: StockState;
    }[] = await this.ds.query(`
      SELECT pl.id AS "planId", pr.name AS "productName", pl.name AS "planName",
             pl."lowStockThreshold", vs.available, vs.reserved, vs.sold, vs."stockState"
        FROM plans pl
        JOIN products pr ON pr.id = pl."productId"
        JOIN v_plan_stock vs ON vs."planId" = pl.id
       ORDER BY pr.name, pl.name
    `);
    const usdPenRate = await this.settings.getNumberOrNull(SETTING_USD_PEN_RATE);
    return { items: rows.map((row) => InventoryItemDto.from(row)), usdPenRate };
  }

  async listAvailableLicenses(planId: string): Promise<AvailableLicenseDto[]> {
    const plan = await this.ds.query(`SELECT id FROM plans WHERE id = $1`, [
      planId,
    ]);
    if (plan.length === 0) {
      throw new NotFoundException('Plan no encontrado');
    }
    const rows: { id: string; createdAt: Date }[] = await this.ds.query(
      `SELECT id, "createdAt" FROM license_items
        WHERE "planId" = $1 AND status = $2
        ORDER BY "createdAt" ASC`,
      [planId, LicenseStatus.AVAILABLE],
    );
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt }));
  }
}
```

Crear `backend/src/inventory/inventory.controller.ts`:

```ts
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../database/enums';
import { AvailableLicenseDto } from './dto/available-license.dto';
import { InventoryResponseDto } from './dto/inventory-item.dto';
import { InventoryService } from './inventory.service';

@ApiTags('admin-inventory')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(): Promise<InventoryResponseDto> {
    return this.inventory.list();
  }

  @Get('plans/:planId/licenses')
  listAvailableLicenses(
    @Param('planId', new ParseUUIDPipe()) planId: string,
  ): Promise<AvailableLicenseDto[]> {
    return this.inventory.listAvailableLicenses(planId);
  }
}
```

Nota: `AvailableLicenseDto` quedó definido dos veces (en `dto/available-license.dto.ts` y re-exportado desde `dto/inventory-item.dto.ts` en el bosquejo anterior) — usar solo la de `available-license.dto.ts`; `inventory-item.dto.ts` no debe declararla.

Crear `backend/src/inventory/inventory.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [SettingsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
```

En `backend/src/app.module.ts`, agregar el import y registrarlo:

```ts
import { InventoryModule } from './inventory/inventory.module';
```

```ts
    CatalogAdminModule,
    PaymentMethodsModule,
    OrdersModule,
    InventoryModule,
    ...(runWorkersInApi() ? [WorkersModule] : []),
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npm run test:e2e -- inventory`
Expected: PASS (6 tests).

- [ ] **Step 5: Correr el resto de la suite para asegurar que nada se rompió**

Run: `cd backend && npm run test:e2e`
Expected: PASS (todos los e2e existentes siguen pasando; `SettingsService` ahora pide `AuditService` en el constructor, pero es global, así que ningún módulo que la use necesita cambios).

- [ ] **Step 6: Commit**

```bash
git add backend/src/settings/settings.service.ts backend/src/inventory backend/src/app.module.ts backend/test/inventory.e2e-spec.ts
git commit -m "Backend: lectura de inventario (GET /admin/inventory y licencias disponibles por plan)"
```

---

### Task 2: Backend — preview y carga de lotes (`POST /admin/inventory/batches/preview`, `POST /admin/inventory/batches`)

**Files:**
- Create: `backend/src/inventory/dto/batch-preview.dto.ts`
- Create: `backend/src/inventory/dto/batch-preview-result.dto.ts`
- Create: `backend/src/inventory/dto/create-batch.dto.ts`
- Create: `backend/src/inventory/dto/create-batch-result.dto.ts`
- Modify: `backend/src/inventory/inventory.service.ts`
- Modify: `backend/src/inventory/inventory.controller.ts`
- Modify: `backend/test/inventory.e2e-spec.ts`

**Interfaces:**
- Consumes: `CryptoService.hash`/`encrypt` (global, ya existe); `AuditService.log` (global); `Plan`, `LicenseBatch`, `LicenseItem` de `../database/entities`; `LicenseStatus` de `../database/enums`; `CURRENCIES`/`Currency` de `../database/currency`.
- Produces: `BatchPreviewDto { planId, secrets }`; `BatchPreviewResultDto { validCount, duplicateCount, errorCount }`; `CreateBatchDto { planId, costCurrency, unitCostCents, supplier?, secrets }`; `CreateBatchResultDto { batchId, loadedCount, duplicateCount, errorCount }`; `InventoryService.preview(dto)`; `InventoryService.createBatch(dto, admin)` (el método privado `classifySecrets` que ambos comparten no se expone fuera del servicio).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/test/inventory.e2e-spec.ts`, dentro del mismo `describe('/admin/inventory', ...)`, después del `describe('GET /admin/inventory/plans/:planId/licenses', ...)` ya existente. Primero ampliar los imports del archivo:

```ts
import { CryptoService } from '../src/common/crypto/crypto.service';
import { LicenseItem } from '../src/database/entities';
import { LicenseStatus } from '../src/database/enums';
```

Y agregar:

```ts
  describe('POST /admin/inventory/batches/preview', () => {
    it('cuenta válidas/duplicadas/con error sin persistir nada', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      const crypto = app.get(CryptoService);
      await ds.getRepository(LicenseItem).save({
        planId: catalog.plan.id,
        batchId: catalog.batch.id,
        secretEncrypted: crypto.encrypt('YA-EXISTE'),
        secretHash: crypto.hash('YA-EXISTE'),
        status: LicenseStatus.AVAILABLE,
      });

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches/preview')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          secrets: ['YA-EXISTE', 'YA-EXISTE', 'NUEVA-1', ''],
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ validCount: 1, duplicateCount: 2, errorCount: 1 });

      const countAfter: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_items WHERE "planId" = $1`,
        [catalog.plan.id],
      );
      expect(Number(countAfter[0].count)).toBe(1);
    });

    it('responde 404 si el plan no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches/preview')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ planId: randomUUID(), secrets: ['X'] });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/inventory/batches', () => {
    it('carga un lote en PEN: inserta solo las válidas, fxRatePen nulo, y audita', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'PEN',
          unitCostCents: 500,
          supplier: 'Proveedor Test',
          secrets: ['PEN-1', 'PEN-1', ''],
        });

      expect(res.status).toBe(200);
      const body = res.body as {
        batchId: string;
        loadedCount: number;
        duplicateCount: number;
        errorCount: number;
      };
      expect(body).toEqual({
        batchId: body.batchId,
        loadedCount: 1,
        duplicateCount: 1,
        errorCount: 1,
      });

      const batchRow: { fxRatePen: string | null; costCurrency: string }[] =
        await ds.query(
          `SELECT "fxRatePen", "costCurrency" FROM license_batches WHERE id = $1`,
          [body.batchId],
        );
      expect(batchRow[0]).toEqual({ fxRatePen: null, costCurrency: 'PEN' });

      const licenseCount: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_items WHERE "batchId" = $1`,
        [body.batchId],
      );
      expect(Number(licenseCount[0].count)).toBe(1);

      const auditRows: { entityId: string; actorId: string }[] =
        await ds.query(
          `SELECT "entityId", "actorId" FROM audit_logs WHERE action = 'license_batch.created' AND "entityId" = $1`,
          [body.batchId],
        );
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actorId).toBe(admin.id);
    });

    it('en USD sin tasa configurada responde 400 y no crea el lote', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      const before: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'USD',
          unitCostCents: 200,
          secrets: ['USD-1'],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/tasa USD→PEN/);
      const after: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );
      expect(after[0].count).toBe(before[0].count);
    });

    it('en USD con tasa configurada congela el valor vigente en el lote', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      await ds.query(
        `INSERT INTO settings (key, value) VALUES ('usdPenRate', '3.75'::jsonb)`,
      );

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'USD',
          unitCostCents: 200,
          secrets: ['USD-OK'],
        });

      expect(res.status).toBe(200);
      const batchRow: { fxRatePen: string }[] = await ds.query(
        `SELECT "fxRatePen" FROM license_batches WHERE id = $1`,
        [res.body.batchId],
      );
      expect(batchRow[0].fxRatePen).toBe('3.7500');
    });

    it('0 válidas responde 400 y no crea el lote (rollback)', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 0 });
      const before: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );

      const res = await request(app.getHttpServer())
        .post('/admin/inventory/batches')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({
          planId: catalog.plan.id,
          costCurrency: 'PEN',
          unitCostCents: 500,
          secrets: ['', '   '],
        });

      expect(res.status).toBe(400);
      const after: { count: string }[] = await ds.query(
        `SELECT count(*) FROM license_batches WHERE "planId" = $1`,
        [catalog.plan.id],
      );
      expect(after[0].count).toBe(before[0].count);
    });
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npm run test:e2e -- inventory`
Expected: FAIL — 404/`Cannot POST` en las rutas de `batches` (todavía no existen).

- [ ] **Step 3: Implementar**

Crear `backend/src/inventory/dto/batch-preview.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, IsUUID } from 'class-validator';

export class BatchPreviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'planId debe ser un UUID' })
  planId!: string;

  @ApiProperty({ type: [String] })
  @IsArray({ message: 'secrets debe ser una lista' })
  @ArrayMinSize(1, { message: 'secrets necesita al menos una línea' })
  @IsString({ each: true, message: 'Cada secreto debe ser texto' })
  secrets!: string[];
}
```

Crear `backend/src/inventory/dto/batch-preview-result.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class BatchPreviewResultDto {
  @ApiProperty() validCount!: number;
  @ApiProperty() duplicateCount!: number;
  @ApiProperty() errorCount!: number;
}
```

Crear `backend/src/inventory/dto/create-batch.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class CreateBatchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'planId debe ser un UUID' })
  planId!: string;

  @ApiProperty({ enum: CURRENCIES })
  @IsIn(CURRENCIES, { message: 'costCurrency debe ser PEN o USD' })
  costCurrency!: Currency;

  @ApiProperty({ minimum: 0 })
  @IsInt({ message: 'unitCostCents debe ser un número entero' })
  @Min(0, { message: 'unitCostCents no puede ser negativo' })
  unitCostCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'supplier debe ser texto' })
  @Length(1, 120, { message: 'supplier admite hasta 120 caracteres' })
  supplier?: string;

  @ApiProperty({ type: [String] })
  @IsArray({ message: 'secrets debe ser una lista' })
  @ArrayMinSize(1, { message: 'secrets necesita al menos una línea' })
  @IsString({ each: true, message: 'Cada secreto debe ser texto' })
  secrets!: string[];
}
```

Crear `backend/src/inventory/dto/create-batch-result.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class CreateBatchResultDto {
  @ApiProperty() batchId!: string;
  @ApiProperty() loadedCount!: number;
  @ApiProperty() duplicateCount!: number;
  @ApiProperty() errorCount!: number;
}
```

Reemplazar el contenido completo de `backend/src/inventory/inventory.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { LicenseBatch, LicenseItem } from '../database/entities';
import { LicenseStatus } from '../database/enums';
import { SettingsService, SETTING_USD_PEN_RATE } from '../settings/settings.service';
import type { StockState } from '../database/views/plan-stock.view';
import { AvailableLicenseDto } from './dto/available-license.dto';
import { BatchPreviewDto } from './dto/batch-preview.dto';
import { BatchPreviewResultDto } from './dto/batch-preview-result.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateBatchResultDto } from './dto/create-batch-result.dto';
import { InventoryItemDto, InventoryResponseDto } from './dto/inventory-item.dto';

interface SecretCandidate {
  plain: string;
  hash: string;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<InventoryResponseDto> {
    const rows: {
      planId: string;
      productName: string;
      planName: string;
      lowStockThreshold: number;
      available: number;
      reserved: number;
      sold: number;
      stockState: StockState;
    }[] = await this.ds.query(`
      SELECT pl.id AS "planId", pr.name AS "productName", pl.name AS "planName",
             pl."lowStockThreshold", vs.available, vs.reserved, vs.sold, vs."stockState"
        FROM plans pl
        JOIN products pr ON pr.id = pl."productId"
        JOIN v_plan_stock vs ON vs."planId" = pl.id
       ORDER BY pr.name, pl.name
    `);
    const usdPenRate = await this.settings.getNumberOrNull(SETTING_USD_PEN_RATE);
    return { items: rows.map((row) => InventoryItemDto.from(row)), usdPenRate };
  }

  async listAvailableLicenses(planId: string): Promise<AvailableLicenseDto[]> {
    await this.requirePlan(this.ds.manager, planId);
    const rows: { id: string; createdAt: Date }[] = await this.ds.query(
      `SELECT id, "createdAt" FROM license_items
        WHERE "planId" = $1 AND status = $2
        ORDER BY "createdAt" ASC`,
      [planId, LicenseStatus.AVAILABLE],
    );
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt }));
  }

  async preview(dto: BatchPreviewDto): Promise<BatchPreviewResultDto> {
    await this.requirePlan(this.ds.manager, dto.planId);
    const { valid, duplicateCount, errorCount } = await this.classifySecrets(
      dto.secrets,
      this.ds.manager,
    );
    return { validCount: valid.length, duplicateCount, errorCount };
  }

  async createBatch(
    dto: CreateBatchDto,
    admin: AuthenticatedUser,
  ): Promise<CreateBatchResultDto> {
    return this.ds.transaction(async (m) => {
      await this.requirePlan(m, dto.planId);

      let fxRatePen: string | null = null;
      if (dto.costCurrency === 'USD') {
        const rate = await this.settings.getNumberOrNull(SETTING_USD_PEN_RATE, m);
        if (rate === null) {
          throw new BadRequestException(
            'Configura la tasa USD→PEN antes de cargar un lote en dólares',
          );
        }
        fxRatePen = rate.toFixed(4);
      }

      const { valid, duplicateCount, errorCount } = await this.classifySecrets(
        dto.secrets,
        m,
      );
      if (valid.length === 0) {
        throw new BadRequestException('No se cargó ninguna licencia válida');
      }

      const batch = await m.save(
        LicenseBatch,
        m.create(LicenseBatch, {
          planId: dto.planId,
          supplier: dto.supplier ?? null,
          unitCostCents: dto.unitCostCents,
          costCurrency: dto.costCurrency,
          fxRatePen,
        }),
      );

      for (const candidate of valid) {
        await m.save(
          LicenseItem,
          m.create(LicenseItem, {
            planId: dto.planId,
            batchId: batch.id,
            secretEncrypted: this.crypto.encrypt(candidate.plain),
            secretHash: candidate.hash,
            status: LicenseStatus.AVAILABLE,
          }),
        );
      }

      await this.audit.log(m, {
        actorId: admin.id,
        action: 'license_batch.created',
        entity: 'license_batch',
        entityId: batch.id,
        meta: {
          planId: dto.planId,
          costCurrency: dto.costCurrency,
          unitCostCents: dto.unitCostCents,
          supplier: dto.supplier ?? null,
          loadedCount: valid.length,
          duplicateCount,
          errorCount,
        },
      });

      return {
        batchId: batch.id,
        loadedCount: valid.length,
        duplicateCount,
        errorCount,
      };
    });
  }

  private async requirePlan(manager: EntityManager, planId: string): Promise<void> {
    const rows: { id: string }[] = await manager.query(
      `SELECT id FROM plans WHERE id = $1`,
      [planId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Plan no encontrado');
    }
  }

  /**
   * Dedupe dentro del mismo payload primero, luego contra la base (regla 1, D58).
   * El preview y la carga real comparten esta lógica para que nunca puedan divergir.
   */
  private async classifySecrets(
    secrets: string[],
    manager: EntityManager,
  ): Promise<{ valid: SecretCandidate[]; duplicateCount: number; errorCount: number }> {
    const seen = new Set<string>();
    const candidates: SecretCandidate[] = [];
    let duplicateCount = 0;
    let errorCount = 0;

    for (const raw of secrets) {
      const plain = raw.trim();
      if (!plain) {
        errorCount++;
        continue;
      }
      const hash = this.crypto.hash(plain);
      if (seen.has(hash)) {
        duplicateCount++;
        continue;
      }
      seen.add(hash);
      candidates.push({ plain, hash });
    }

    if (candidates.length === 0) {
      return { valid: [], duplicateCount, errorCount };
    }

    const existing: { secretHash: string }[] = await manager.query(
      `SELECT "secretHash" FROM license_items WHERE "secretHash" = ANY($1::char(64)[])`,
      [candidates.map((c) => c.hash)],
    );
    const existingHashes = new Set(existing.map((e) => e.secretHash));

    const valid: SecretCandidate[] = [];
    for (const candidate of candidates) {
      if (existingHashes.has(candidate.hash)) {
        duplicateCount++;
      } else {
        valid.push(candidate);
      }
    }

    return { valid, duplicateCount, errorCount };
  }
}
```

Reemplazar el contenido completo de `backend/src/inventory/inventory.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '../database/enums';
import { AvailableLicenseDto } from './dto/available-license.dto';
import { BatchPreviewDto } from './dto/batch-preview.dto';
import { BatchPreviewResultDto } from './dto/batch-preview-result.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { CreateBatchResultDto } from './dto/create-batch-result.dto';
import { InventoryResponseDto } from './dto/inventory-item.dto';
import { InventoryService } from './inventory.service';

@ApiTags('admin-inventory')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(): Promise<InventoryResponseDto> {
    return this.inventory.list();
  }

  @Get('plans/:planId/licenses')
  listAvailableLicenses(
    @Param('planId', new ParseUUIDPipe()) planId: string,
  ): Promise<AvailableLicenseDto[]> {
    return this.inventory.listAvailableLicenses(planId);
  }

  @Post('batches/preview')
  @HttpCode(200)
  preview(@Body() dto: BatchPreviewDto): Promise<BatchPreviewResultDto> {
    return this.inventory.preview(dto);
  }

  @Post('batches')
  @HttpCode(200)
  createBatch(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateBatchDto,
  ): Promise<CreateBatchResultDto> {
    return this.inventory.createBatch(dto, admin);
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npm run test:e2e -- inventory`
Expected: PASS (todos, incluidos los 6 nuevos de este task).

- [ ] **Step 5: Commit**

```bash
git add backend/src/inventory backend/test/inventory.e2e-spec.ts
git commit -m "Backend: preview y carga de lotes de licencias (inventario S7)"
```

---

### Task 3: Backend — anular licencia y tasa USD→PEN (`POST .../licenses/:id/void`, `PUT .../usd-rate`)

**Files:**
- Create: `backend/src/inventory/dto/void-license.dto.ts`
- Create: `backend/src/inventory/dto/update-usd-rate.dto.ts`
- Modify: `backend/src/inventory/inventory.service.ts`
- Modify: `backend/src/inventory/inventory.controller.ts`
- Modify: `backend/test/inventory.e2e-spec.ts`

**Interfaces:**
- Consumes: `SettingsService.setNumber` (Task 1); `trg_license_status_guard` (ya existe — bloquea cualquier transición de licencia que no sea `AVAILABLE -> VOID` con un 409 vía `AllExceptionsFilter`, sin código nuevo).
- Produces: `VoidLicenseDto { reason }`; `UpdateUsdRateDto { rate }`; `InventoryService.voidLicense(id, dto, admin): Promise<void>`; `InventoryService.setUsdRate(rate, admin): Promise<void>`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/test/inventory.e2e-spec.ts`, al final del `describe('/admin/inventory', ...)`. Ampliar los imports con `insertOrder` (ya importado desde `./utils/factories` en Task del admin-payments — verificar si ya está en este archivo; si no, agregarlo a la línea `import { createCatalog, createUser } from './utils/factories';` → `import { createCatalog, createUser, insertOrder } from './utils/factories';`) y `OrderStatus` desde `../src/database/enums`.

```ts
  describe('POST /admin/inventory/licenses/:id/void', () => {
    it('anula una licencia AVAILABLE y audita el motivo', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 1 });
      const licenseId = catalog.licenseIds[0];

      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${licenseId}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'Clave reportada como inválida por el proveedor' });

      expect(res.status).toBe(204);
      const row: { status: string }[] = await ds.query(
        `SELECT status FROM license_items WHERE id = $1`,
        [licenseId],
      );
      expect(row[0].status).toBe('VOID');

      const auditRows: { meta: { reason: string } }[] = await ds.query(
        `SELECT meta FROM audit_logs WHERE action = 'license_item.voided' AND "entityId" = $1`,
        [licenseId],
      );
      expect(auditRows[0].meta.reason).toBe(
        'Clave reportada como inválida por el proveedor',
      );
    });

    it('responde 409 si la licencia ya no está AVAILABLE', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const customer = await createUser(ds, { role: Role.CUSTOMER });
      const catalog = await createCatalog(ds, { stock: 1 });
      await insertOrder(ds, {
        userId: customer.id,
        currency: 'PEN',
        lines: [
          {
            planId: catalog.plan.id,
            unitPriceCents: 1000,
            licenseId: catalog.licenseIds[0],
          },
        ],
        status: OrderStatus.IN_REVIEW,
      });

      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${catalog.licenseIds[0]}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'Intento sobre una licencia reservada' });

      expect(res.status).toBe(409);
    });

    it('responde 404 si la licencia no existe', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${randomUUID()}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: 'No existe' });
      expect(res.status).toBe(404);
    });

    it('responde 400 si el motivo está vacío o es solo espacios', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const catalog = await createCatalog(ds, { stock: 1 });
      const res = await request(app.getHttpServer())
        .post(`/admin/inventory/licenses/${catalog.licenseIds[0]}/void`)
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ reason: '   ' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/inventory/usd-rate', () => {
    it('actualiza la tasa y queda reflejada en GET /admin/inventory, auditada', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });

      const res = await request(app.getHttpServer())
        .put('/admin/inventory/usd-rate')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ rate: 3.8 });
      expect(res.status).toBe(204);

      const listRes = await request(app.getHttpServer())
        .get('/admin/inventory')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);
      expect(listRes.body.usdPenRate).toBe(3.8);

      const auditRows: { meta: { value: number } }[] = await ds.query(
        `SELECT meta FROM audit_logs WHERE action = 'setting.updated' AND "entityId" = 'usdPenRate'`,
      );
      expect(auditRows[0].meta.value).toBe(3.8);
    });

    it('responde 400 con una tasa menor o igual a cero', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const res = await request(app.getHttpServer())
        .put('/admin/inventory/usd-rate')
        .set('Authorization', `Bearer ${tokenFor(admin)}`)
        .send({ rate: 0 });
      expect(res.status).toBe(400);
    });
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npm run test:e2e -- inventory`
Expected: FAIL — 404 en `POST .../licenses/:id/void` y `PUT .../usd-rate` (rutas inexistentes).

- [ ] **Step 3: Implementar**

Crear `backend/src/inventory/dto/void-license.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { Length } from 'class-validator';

export class VoidLicenseDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 500, { message: 'reason no puede estar vacío' })
  reason!: string;
}
```

Crear `backend/src/inventory/dto/update-usd-rate.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class UpdateUsdRateDto {
  @ApiProperty({ minimum: 0, exclusiveMinimum: true })
  @IsNumber({}, { message: 'rate debe ser un número' })
  @IsPositive({ message: 'rate debe ser mayor a 0' })
  rate!: number;
}
```

En `backend/src/inventory/inventory.service.ts`, agregar los dos métodos nuevos (y el import de `LicenseItem`/`VoidLicenseDto` que falte) sin tocar el resto de la clase:

```ts
  async voidLicense(id: string, dto: VoidLicenseDto, admin: AuthenticatedUser): Promise<void> {
    await this.ds.transaction(async (m) => {
      const license = await m.findOneBy(LicenseItem, { id });
      if (!license) {
        throw new NotFoundException('Licencia no encontrada');
      }
      // Si license.status no es AVAILABLE, trg_license_status_guard bloquea el UPDATE con
      // P0001 y AllExceptionsFilter ya lo traduce a 409 — no se necesita un catch aquí.
      await m.update(LicenseItem, { id }, { status: LicenseStatus.VOID });
      await this.audit.log(m, {
        actorId: admin.id,
        action: 'license_item.voided',
        entity: 'license_item',
        entityId: id,
        meta: { reason: dto.reason, previousStatus: license.status },
      });
    });
  }

  async setUsdRate(rate: number, admin: AuthenticatedUser): Promise<void> {
    await this.settings.setNumber(SETTING_USD_PEN_RATE, rate, admin.id);
  }
```

Agregar los imports correspondientes al tope del archivo (`VoidLicenseDto` desde `./dto/void-license.dto`; `LicenseBatch, LicenseItem` ya deben estar importados desde el Task 2 — si no, agregar `LicenseItem` al import existente `import { LicenseBatch, LicenseItem } from '../database/entities';`).

En `backend/src/inventory/inventory.controller.ts`, agregar los dos endpoints nuevos (y los imports `Put`, `VoidLicenseDto`, `UpdateUsdRateDto`):

```ts
  @Post('licenses/:id/void')
  @HttpCode(204)
  voidLicense(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VoidLicenseDto,
  ): Promise<void> {
    return this.inventory.voidLicense(id, dto, admin);
  }

  @Put('usd-rate')
  @HttpCode(204)
  updateUsdRate(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: UpdateUsdRateDto,
  ): Promise<void> {
    return this.inventory.setUsdRate(dto.rate, admin);
  }
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd backend && npm run test:e2e -- inventory`
Expected: PASS (todos, incluidos los 6 nuevos de este task — 18 en total en el archivo).

- [ ] **Step 5: Correr toda la suite backend**

Run: `cd backend && npm run typecheck && npm test && npm run test:e2e`
Expected: PASS sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add backend/src/inventory backend/test/inventory.e2e-spec.ts
git commit -m "Backend: anular licencia y tasa USD-PEN editable (inventario S7)"
```

---

### Task 4: `inventory-client.ts` — Server Actions del panel de Inventario

**Files:**
- Create: `frontend/src/lib/inventory-client.ts`
- Test: `frontend/src/lib/inventory-client.test.ts`

**Interfaces:**
- Consumes: `auth` de `@/auth` (ya existe); `type StockState` de `@/lib/catalog-client` (ya existe).
- Produces: `InventoryItemView`, `InventoryView`, `AvailableLicenseView`, `BatchPreviewResultView`, `CreateBatchInput`, `CreateBatchResultView`, `InventoryActionResult<T>`, `fetchInventory()`, `fetchAvailableLicenses(planId)`, `previewBatch(planId, secrets)`, `createBatch(input)`, `voidLicense(id, reason)`, `updateUsdRate(rate)` — usados por la Task 5.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/inventory-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("fetchInventory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace GET a /admin/inventory con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], usdPenRate: null };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchInventory } = await import("./inventory-client");
    const result = await fetchInventory();

    expect(result).toEqual({ ok: true, data: page });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-admin" });
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchInventory } = await import("./inventory-client");
    const result = await fetchInventory();

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchAvailableLicenses", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace GET a /admin/inventory/plans/:planId/licenses", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const list = [{ id: "lic-1", createdAt: "2026-11-11T00:00:00.000Z" }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(list), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAvailableLicenses } = await import("./inventory-client");
    const result = await fetchAvailableLicenses("plan-1");

    expect(result).toEqual({ ok: true, data: list });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/plans/plan-1/licenses");
  });
});

describe("previewBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/inventory/batches/preview con planId y secrets", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const summary = { validCount: 1, duplicateCount: 1, errorCount: 0 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { previewBatch } = await import("./inventory-client");
    const result = await previewBatch("plan-1", ["A", "A"]);

    expect(result).toEqual({ ok: true, data: summary });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/batches/preview");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      planId: "plan-1",
      secrets: ["A", "A"],
    });
  });
});

describe("createBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/inventory/batches con el body completo", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const result = { batchId: "batch-1", loadedCount: 1, duplicateCount: 0, errorCount: 0 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createBatch } = await import("./inventory-client");
    const res = await createBatch({
      planId: "plan-1",
      costCurrency: "USD",
      unitCostCents: 200,
      supplier: "Proveedor X",
      secrets: ["A"],
    });

    expect(res).toEqual({ ok: true, data: result });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/batches");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      planId: "plan-1",
      costCurrency: "USD",
      unitCostCents: 200,
      supplier: "Proveedor X",
      secrets: ["A"],
    });
  });

  it("devuelve ok:false con el mensaje del backend si falla (ej. 400 sin tasa configurada)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ statusCode: 400, message: "Configura la tasa USD→PEN antes de cargar un lote en dólares", error: "Bad Request" }),
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createBatch } = await import("./inventory-client");
    const res = await createBatch({
      planId: "plan-1",
      costCurrency: "USD",
      unitCostCents: 200,
      secrets: ["A"],
    });

    expect(res).toEqual({
      ok: false,
      status: 400,
      message: "Configura la tasa USD→PEN antes de cargar un lote en dólares",
    });
  });
});

describe("voidLicense", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/inventory/licenses/:id/void con el motivo, sin cuerpo en la respuesta (204)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { voidLicense } = await import("./inventory-client");
    const result = await voidLicense("lic-1", "Clave inválida");

    expect(result).toEqual({ ok: true, data: undefined });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/licenses/lic-1/void");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: "Clave inválida" });
  });
});

describe("updateUsdRate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace PUT a /admin/inventory/usd-rate con la tasa", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { updateUsdRate } = await import("./inventory-client");
    const result = await updateUsdRate(3.75);

    expect(result).toEqual({ ok: true, data: undefined });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/inventory/usd-rate");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ rate: 3.75 });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run src/lib/inventory-client.test.ts`
Expected: FAIL — `Cannot find module './inventory-client'`.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/inventory-client.ts`:

```ts
"use server";

import { auth } from "@/auth";
import type { StockState } from "./catalog-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export interface InventoryItemView {
  planId: string;
  productName: string;
  planName: string;
  lowStockThreshold: number;
  available: number;
  reserved: number;
  sold: number;
  status: StockState;
}

export interface InventoryView {
  items: InventoryItemView[];
  usdPenRate: number | null;
}

export interface AvailableLicenseView {
  id: string;
  createdAt: string;
}

export interface BatchPreviewResultView {
  validCount: number;
  duplicateCount: number;
  errorCount: number;
}

export interface CreateBatchInput {
  planId: string;
  costCurrency: "PEN" | "USD";
  unitCostCents: number;
  supplier?: string;
  secrets: string[];
}

export interface CreateBatchResultView {
  batchId: string;
  loadedCount: number;
  duplicateCount: number;
  errorCount: number;
}

export type InventoryActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown },
): Promise<InventoryActionResult<T>> {
  const session = await auth();
  if (!session?.accessToken) {
    return { ok: false, status: 401, message: "Inicia sesión para continuar" };
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message ?? "No pudimos completar la operación";
    return { ok: false, status: res.status, message };
  }

  if (res.status === 204) {
    return { ok: true, data: undefined as T };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}

export async function fetchInventory(): Promise<InventoryActionResult<InventoryView>> {
  return callBackend<InventoryView>("/admin/inventory", { method: "GET" });
}

export async function fetchAvailableLicenses(
  planId: string,
): Promise<InventoryActionResult<AvailableLicenseView[]>> {
  return callBackend<AvailableLicenseView[]>(`/admin/inventory/plans/${planId}/licenses`, {
    method: "GET",
  });
}

export async function previewBatch(
  planId: string,
  secrets: string[],
): Promise<InventoryActionResult<BatchPreviewResultView>> {
  return callBackend<BatchPreviewResultView>("/admin/inventory/batches/preview", {
    method: "POST",
    body: { planId, secrets },
  });
}

export async function createBatch(
  input: CreateBatchInput,
): Promise<InventoryActionResult<CreateBatchResultView>> {
  return callBackend<CreateBatchResultView>("/admin/inventory/batches", {
    method: "POST",
    body: input,
  });
}

export async function voidLicense(
  id: string,
  reason: string,
): Promise<InventoryActionResult<void>> {
  return callBackend<void>(`/admin/inventory/licenses/${id}/void`, {
    method: "POST",
    body: { reason },
  });
}

export async function updateUsdRate(rate: number): Promise<InventoryActionResult<void>> {
  return callBackend<void>("/admin/inventory/usd-rate", {
    method: "PUT",
    body: { rate },
  });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npx vitest run src/lib/inventory-client.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/inventory-client.ts frontend/src/lib/inventory-client.test.ts
git commit -m "Frontend: inventory-client (Server Actions del panel de inventario)"
```

---

### Task 5: `/admin/inventario` — totales, filtros, filas expandibles y panel de carga

**Files:**
- Create: `frontend/src/components/inventory-screen.tsx`
- Modify: `frontend/src/app/admin/inventario/page.tsx`

**Interfaces:**
- Consumes: todo lo de `@/lib/inventory-client` (Task 4); `StockBadge` de `@/components/stock-badge` (ya existe); `formatPriceCents` de `@/lib/format` (ya existe, para mostrar la tasa como S/ X.XX).
- Produces: ruta `/admin/inventario` real (reemplaza el placeholder).

- [ ] **Step 1: Implementar `inventory-screen.tsx`**

Crear `frontend/src/components/inventory-screen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { StockBadge } from "@/components/stock-badge";
import {
  createBatch,
  fetchAvailableLicenses,
  fetchInventory,
  previewBatch,
  updateUsdRate,
  voidLicense,
  type AvailableLicenseView,
  type BatchPreviewResultView,
  type InventoryItemView,
  type InventoryView,
} from "@/lib/inventory-client";

type Filter = "all" | "low" | "out";

function matchesFilter(item: InventoryItemView, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "low") return item.status === "LOW";
  return item.status === "OUT_OF_STOCK";
}

export function InventoryScreen({ initial }: { initial: InventoryView }) {
  const [items, setItems] = useState(initial.items);
  const [usdPenRate, setUsdPenRate] = useState(initial.usdPenRate);
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [licensesByPlan, setLicensesByPlan] = useState<Record<string, AvailableLicenseView[]>>({});
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");

  const [formPlanId, setFormPlanId] = useState(initial.items[0]?.planId ?? "");
  const [costCurrency, setCostCurrency] = useState<"PEN" | "USD">("PEN");
  const [costInput, setCostInput] = useState("");
  const [supplier, setSupplier] = useState("");
  const [secretsText, setSecretsText] = useState("");
  const [preview, setPreview] = useState<BatchPreviewResultView | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refetchInventory() {
    const result = await fetchInventory();
    if (result.ok) {
      setItems(result.data.items);
      setUsdPenRate(result.data.usdPenRate);
    }
  }

  useEffect(() => {
    const lines = secretsText.split("\n");
    if (!formPlanId || lines.every((l) => l.trim() === "")) {
      setPreview(null);
      return;
    }
    const timeout = setTimeout(async () => {
      const result = await previewBatch(formPlanId, lines);
      if (result.ok) setPreview(result.data);
    }, 400);
    return () => clearTimeout(timeout);
  }, [formPlanId, secretsText]);

  async function toggleExpand(planId: string) {
    if (expandedPlanId === planId) {
      setExpandedPlanId(null);
      return;
    }
    setExpandedPlanId(planId);
    setVoidingId(null);
    if (!licensesByPlan[planId]) {
      const result = await fetchAvailableLicenses(planId);
      if (result.ok) {
        setLicensesByPlan((prev) => ({ ...prev, [planId]: result.data }));
      }
    }
  }

  function startAdd(planId: string) {
    setFormPlanId(planId);
  }

  async function handleSaveRate() {
    const rate = Number(rateInput);
    if (!Number.isFinite(rate) || rate <= 0) {
      setError("La tasa debe ser un número mayor a 0");
      return;
    }
    const result = await updateUsdRate(rate);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setUsdPenRate(rate);
    setEditingRate(false);
    setError(null);
  }

  async function handleConfirmVoid(licenseId: string, planId: string) {
    const result = await voidLicense(licenseId, voidReason);
    if (!result.ok) {
      setError(result.message);
      const refreshed = await fetchAvailableLicenses(planId);
      if (refreshed.ok) setLicensesByPlan((prev) => ({ ...prev, [planId]: refreshed.data }));
      await refetchInventory();
      return;
    }
    setLicensesByPlan((prev) => ({
      ...prev,
      [planId]: (prev[planId] ?? []).filter((l) => l.id !== licenseId),
    }));
    setVoidingId(null);
    setVoidReason("");
    setError(null);
    await refetchInventory();
  }

  async function handleCreateBatch() {
    const costCents = Math.round(Number(costInput.replace(",", ".")) * 100);
    if (!formPlanId || !Number.isFinite(costCents) || costCents < 0) {
      setError("Completa el plan y un costo válido antes de cargar");
      return;
    }
    const secrets = secretsText.split("\n");
    setSubmitting(true);
    setError(null);
    const result = await createBatch({
      planId: formPlanId,
      costCurrency,
      unitCostCents: costCents,
      supplier: supplier.trim() || undefined,
      secrets,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const planName = items.find((i) => i.planId === formPlanId)?.planName ?? "";
    setCostInput("");
    setSupplier("");
    setSecretsText("");
    setPreview(null);
    setMessage(`${result.data.loadedCount} licencias cargadas a ${planName}.`);
    await refetchInventory();
  }

  const totals = items.reduce(
    (acc, item) => ({
      available: acc.available + item.available,
      reserved: acc.reserved + item.reserved,
      sold: acc.sold + item.sold,
    }),
    { available: 0, reserved: 0, sold: 0 },
  );
  const visibleItems = items.filter((item) => matchesFilter(item, filter));

  return (
    <div className="flex flex-col gap-5">
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="rounded-2xl border border-line-soft bg-surface p-4">
          <p className="text-sm text-muted">Disponibles</p>
          <p className="font-display text-2xl font-bold text-ink">{totals.available}</p>
        </div>
        <div className="rounded-2xl border border-line-soft bg-surface p-4">
          <p className="text-sm text-muted">Reservadas</p>
          <p className="font-display text-2xl font-bold text-ink">{totals.reserved}</p>
        </div>
        <div className="rounded-2xl border border-line-soft bg-surface p-4">
          <p className="text-sm text-muted">Vendidas</p>
          <p className="font-display text-2xl font-bold text-ink">{totals.sold}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { id: "all", label: "Todos" },
          { id: "low", label: "Stock bajo" },
          { id: "out", label: "Agotados" },
        ] as const).map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
              filter === f.id ? "border-ink bg-ink text-white" : "border-line-strong text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Stock por plan" className="flex-1 basis-[480px] overflow-hidden rounded-2xl border border-line-soft bg-surface">
          {visibleItems.length === 0 ? (
            <p className="p-10 text-center text-muted">Ningún plan en esta categoría.</p>
          ) : (
            visibleItems.map((item) => (
              <div key={item.planId} className="border-b border-line-soft last:border-b-0">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.planId)}
                    className="flex min-h-11 flex-1 basis-[200px] flex-col items-start text-left"
                  >
                    <span className="font-semibold text-ink">
                      {item.productName} · {item.planName}
                    </span>
                    <span className="text-sm text-muted">Alerta cuando queden menos de {item.lowStockThreshold}</span>
                  </button>
                  <span className="text-sm text-muted">{item.available} disponibles</span>
                  <StockBadge state={item.status} />
                  <a
                    href="#cargar-licencias"
                    onClick={() => startAdd(item.planId)}
                    className="flex min-h-11 items-center px-3 text-sm font-semibold text-accent"
                  >
                    + Agregar
                  </a>
                </div>
                {expandedPlanId === item.planId ? (
                  <div className="flex flex-col gap-2 border-t border-line-soft bg-bg px-5 py-4">
                    {(licensesByPlan[item.planId] ?? []).length === 0 ? (
                      <p className="text-sm text-muted">Sin licencias disponibles para expandir.</p>
                    ) : (
                      licensesByPlan[item.planId]!.map((license) => (
                        <div key={license.id} className="flex flex-wrap items-center gap-3 rounded-[10px] bg-surface px-3 py-2">
                          <span className="flex-1 text-sm text-muted">
                            Cargada el {new Date(license.createdAt).toLocaleDateString("es-PE")}
                          </span>
                          {voidingId === license.id ? (
                            <>
                              <input
                                type="text"
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="Motivo de la anulación"
                                className="min-h-11 flex-1 basis-[180px] rounded-[10px] border border-line-strong px-3 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => handleConfirmVoid(license.id, item.planId)}
                                disabled={!voidReason.trim()}
                                className="min-h-11 rounded-[10px] bg-danger-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setVoidingId(null);
                                  setVoidReason("");
                                }}
                                className="min-h-11 rounded-[10px] border border-line-strong px-4 text-sm font-semibold text-ink"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidingId(license.id);
                                setVoidReason("");
                              }}
                              className="min-h-11 rounded-[10px] border border-danger-ink px-4 text-sm font-semibold text-danger-ink"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </section>

        <section id="cargar-licencias" aria-label="Cargar licencias" className="w-full max-w-[420px] rounded-2xl border border-line-soft bg-surface p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-ink">Cargar licencias</h2>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Plan</span>
              <select
                value={formPlanId}
                onChange={(e) => setFormPlanId(e.target.value)}
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              >
                {items.map((item) => (
                  <option key={item.planId} value={item.planId}>
                    {item.productName} · {item.planName}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Moneda del costo</span>
              <select
                value={costCurrency}
                onChange={(e) => setCostCurrency(e.target.value as "PEN" | "USD")}
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              >
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </select>
            </label>

            {costCurrency === "USD" ? (
              <div className="rounded-[10px] bg-bg px-3 py-2 text-sm">
                {editingRate ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="min-h-11 w-28 rounded-[10px] border border-line-strong px-3"
                    />
                    <button type="button" onClick={handleSaveRate} className="min-h-11 rounded-[10px] bg-accent px-3 font-semibold text-white">
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditingRate(false)} className="min-h-11 rounded-[10px] border border-line-strong px-3">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span>
                    Tasa USD→PEN actual: {usdPenRate !== null ? `S/ ${usdPenRate.toFixed(2)}` : "sin configurar"}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setRateInput(usdPenRate !== null ? String(usdPenRate) : "");
                        setEditingRate(true);
                      }}
                      className="font-semibold text-accent"
                    >
                      Editar
                    </button>
                  </span>
                )}
              </div>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Costo por licencia ({costCurrency})</span>
              <input
                type="text"
                inputMode="decimal"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Proveedor (opcional)</span>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Pega una licencia por línea</span>
              <textarea
                rows={6}
                value={secretsText}
                onChange={(e) => setSecretsText(e.target.value)}
                className="rounded-[10px] border border-line-strong px-3 py-2"
              />
            </label>

            {preview ? (
              <div className="flex flex-col gap-1 rounded-[10px] bg-bg px-4 py-3 text-sm">
                <span className="font-semibold text-success-ink">{preview.validCount} válidas</span>
                <span className="font-semibold text-warning-ink">{preview.duplicateCount} duplicadas (se omiten)</span>
                <span className="font-semibold text-danger-ink">{preview.errorCount} con error</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleCreateBatch}
              disabled={submitting}
              className="min-h-12 rounded-[10px] bg-accent px-6 font-semibold text-white disabled:opacity-50"
            >
              Cargar al inventario
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implementar `page.tsx`**

Reemplazar el contenido completo de `frontend/src/app/admin/inventario/page.tsx`:

```tsx
import { InventoryScreen } from "@/components/inventory-screen";
import { fetchInventory } from "@/lib/inventory-client";

export default async function AdminInventarioPage() {
  const result = await fetchInventory();

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Inventario</h1>
      {!result.ok ? (
        <p className="text-danger-ink">{result.message}</p>
      ) : (
        <InventoryScreen initial={result.data} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Probar manualmente**

Con backend (`npm run start:dev`) y frontend (`npm run dev -- --port 3001`) corriendo, iniciar sesión como admin y visitar `/admin/inventario`. Verificar: totales arriba; filtros Todos/Stock bajo/Agotados filtran las filas; clic en una fila la expande y muestra sus licencias `AVAILABLE` (fecha, sin clave) con botón "Anular" por licencia; "+ Agregar" preselecciona el plan en el formulario y hace scroll al panel; elegir moneda USD muestra "Tasa USD→PEN actual" con "Editar"; pegar claves en el textarea muestra el resumen válidas/duplicadas/con error tras una pausa; "Cargar al inventario" limpia el formulario, muestra el banner y refleja el nuevo stock en la fila del plan; anular una licencia la quita de la lista expandida y de los totales.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/inventory-screen.tsx frontend/src/app/admin/inventario/page.tsx
git commit -m "Frontend: pantalla de Inventario (stock, carga de lotes, anular licencia)"
```

---

### Task 6: E2E Playwright — cargar lote con duplicado y anular una licencia

**Files:**
- Create: `frontend/e2e/inventory.spec.ts`

**Interfaces:**
- Consumes: `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `backend/.env` (ya cargado por `e2e/global-setup.ts`); el plan `[Plan demo]` del seed (`backend/src/database/seed.ts`), que siempre existe tras `npm run seed`.

- [ ] **Step 1: Escribir el test**

Crear `frontend/e2e/inventory.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD no están definidos (revisar backend/.env)");
  }
  await page.goto("/login");
  await page.getByLabel("Correo").fill(adminEmail);
  await page.getByLabel("Contraseña").fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
}

test("admin carga un lote con una clave duplicada y luego anula una licencia", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/inventario");

  const key = `E2E-${Date.now()}`;
  await page.getByLabel("Plan").selectOption({ label: "[Producto demo] · [Plan demo]" });
  await page.getByLabel("Moneda del costo").selectOption("PEN");
  await page.getByLabel(/Costo por licencia/).fill("5.00");
  await page.getByLabel("Pega una licencia por línea").fill(`${key}\n${key}`);

  await expect(page.getByText("1 válidas")).toBeVisible();
  await expect(page.getByText("1 duplicadas (se omiten)")).toBeVisible();

  await page.getByRole("button", { name: "Cargar al inventario" }).click();
  await expect(page.getByText(/1 licencias cargadas/)).toBeVisible();

  await page.getByRole("button", { name: /\[Producto demo\] · \[Plan demo\]/ }).click();
  await expect(page.getByText(/Cargada el/).first()).toBeVisible();

  await page.getByRole("button", { name: "Anular" }).first().click();
  await page.getByPlaceholder("Motivo de la anulación").fill("Clave de prueba E2E, se descarta");
  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(page.getByPlaceholder("Motivo de la anulación")).toHaveCount(0);
});
```

- [ ] **Step 2: Correr el test**

Run: `cd backend && npm run start:dev` (otra terminal), luego `cd frontend && npm run test:e2e -- inventory.spec.ts`
Expected: PASS. Si falla por el texto exacto del `<option>` del select de Plan, ajustar el `label` al que realmente renderiza `inventory-screen.tsx` (`{item.productName} · {item.planName}`) con los valores reales del seed (`[Producto demo]` / `[Plan demo]`).

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/inventory.spec.ts
git commit -m "Frontend: e2e de inventario (carga con duplicado, anular licencia)"
```

---

### Task 7: Actualizar documentación de cierre

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md`
- Modify: `docs/06-api.md`
- Modify: `docs/10-orden-de-ejecucion.md`

**Interfaces:** ninguna (solo documentación).

- [ ] **Step 1: Actualizar RF-ADM-20 a RF-ADM-24**

En `docs/02-requerimientos-funcionales.md`, buscar cada fila por su código exacto y reemplazarla:

```
| RF-ADM-20 | Ver stock por plan: disponibles, reservadas, vendidas, estado y barra. Filtrar por Todos / Stock bajo / Agotados. | M | ✅ (2026-11-11) |
```

```
| RF-ADM-21 | Cargar licencias a un plan pegando una por línea, con costo por unidad (PEN o USD, tasa congelada en el lote) y proveedor opcional. | M | ✅ (2026-11-11; sin CSV, decidido fuera de alcance) |
```

```
| RF-ADM-22 | Antes de confirmar, mostrar resumen **válidas / duplicadas (se omiten) / con error**. Los duplicados se detectan por hash. | M | ✅ (2026-11-11) |
```

```
| RF-ADM-23 | Cada carga crea un **lote** y deja auditoría. | M | ✅ (2026-11-11) |
```

```
| RF-ADM-24 | Anular (`VOID`) una licencia disponible con motivo. | S | ✅ (2026-11-11) |
```

- [ ] **Step 2: Actualizar `docs/06-api.md`**

Buscar las tres filas de inventario existentes y reemplazarlas, agregando las tres filas nuevas que no estaban en la tabla original:

```
| ✅ | `GET /admin/inventory` | Por plan: nombre de producto/plan, disponibles, reservadas, vendidas, umbral y estado (`v_plan_stock`); incluye la tasa USD→PEN vigente (`usdPenRate`, `null` si no se configuró). Sin paginación. |
| ✅ | `GET /admin/inventory/plans/:planId/licenses` | Licencias `AVAILABLE` de un plan: `id` y fecha de carga, nunca la clave. 404 si el plan no existe. |
| ✅ | `POST /admin/inventory/batches/preview` | Body `{planId, secrets[]}` → `{validCount, duplicateCount, errorCount}` sin guardar nada. Duplicados son globales (`secretHash` único). |
| ✅ | `POST /admin/inventory/batches` | Body `{planId, costCurrency, unitCostCents, supplier?, secrets[]}`. Revalida desde cero (no confía en el preview), crea lote + licencias cifradas, congela `fxRatePen` si es USD (400 si no hay tasa configurada), audita. 400 si 0 líneas válidas. |
| ✅ | `POST /admin/inventory/licenses/:id/void` | Body `{reason}`. Anula una licencia (`AVAILABLE -> VOID`); 409 si ya no está `AVAILABLE` (`trg_license_status_guard`); 404 si no existe; audita el motivo. |
| ✅ | `PUT /admin/inventory/usd-rate` | Body `{rate}` (> 0). Actualiza `settings.usdPenRate`, auditado; la rige el siguiente lote en USD. |
```

- [ ] **Step 3: Cerrar el paso 5 del roadmap**

En `docs/10-orden-de-ejecucion.md`, cambiar la fila del paso 5:

```
| 5 | ✅ Backend + frontend: inventario (`/admin/inventory*`, S7) — 2026-11-11 | Sin carga de lotes real, el stock depende solo del seed; necesario para operar más de una vez. |
```

Y al final del archivo, la sección "## Estado":

```
## Estado (2026-11-11)

Paso 1 completo (`/admin/payments`: list/approve/reject, migración `AdminPaymentFunctions`, 15 pruebas e2e).
Paso 2 completo (catálogo del frontend conectado a la API real — 2026-11-02).
Paso 3 completo (página producto, carrito y checkout de 3 pasos — 2026-11-03).
Paso 4 completo (panel admin de pagos, S6 — 2026-11-07).
Paso 5 completo (inventario, S7 — 2026-11-11).
Próximo: **paso 6** ("Mis pedidos" + reveal de clave, S4).
```

- [ ] **Step 4: Commit**

```bash
git add docs/02-requerimientos-funcionales.md docs/06-api.md docs/10-orden-de-ejecucion.md
git commit -m "Docs: cierre del modulo de inventario (S7) en RF-ADM-20..24, docs/06 y orden de ejecucion"
```

---

## Self-Review

**Cobertura del spec:** ver stock por plan con filtros client-side (Task 1 backend + Task 5 frontend); carga manual sin CSV (Task 2 + Task 5, textarea únicamente); preview sin persistir + revalidación desde cero en la carga real, compartiendo `classifySecrets` (Task 2); duplicados globales vía `secretHash` único (Task 2, `ANY($1::char(64)[])` contra toda la tabla, sin filtrar por plan); moneda del costo con tasa universal congelada por lote (Tasks 1 y 3, `SettingsService.getNumberOrNull`/`setNumber` + `fxRatePen` en `createBatch`); anular licencia en la fila expandida, reusando la tabla existente, sin pantalla nueva (Task 5); sin paginación en `GET /admin/inventory` (Task 1, sin query params de paginación); `GET .../plans/:planId/licenses` nunca expone la clave (Task 1, `AvailableLicenseDto` solo tiene `id`/`createdAt`, verificado en el e2e con `Object.keys`). Todo lo listado en "Fuera de alcance" del spec (`low-stock-check`, `/admin/settings` genérico, CSV, reportes de valor de inventario) no tiene tareas aquí — correcto.

**Placeholders:** ninguno — cada step entrega el archivo completo o el diff exacto a aplicar, sin "TBD" ni código a medio escribir. La única nota de desambiguación (Task 1, evitar declarar `AvailableLicenseDto` dos veces) es una instrucción explícita, no un placeholder.

**Consistencia de tipos:** `InventoryItemDto`/`AvailableLicenseDto`/`BatchPreviewResultDto`/`CreateBatchResultDto` (Tasks 1–2) se consumen sin cambios de forma en `InventoryService` (Task 2–3) y en `inventory-client.ts` (Task 4, mismos nombres de campo en camelCase); `StockState` se reusa desde `database/views/plan-stock.view.ts` (backend) y desde `@/lib/catalog-client` (frontend, ya existente) en vez de inventar un enum paralelo; `classifySecrets` (Task 2) es el único lugar que calcula válidas/duplicadas/errores, y tanto `preview()` como `createBatch()` lo llaman igual; `VoidLicenseDto.reason` (Task 3) es el mismo campo que `voidLicense(id, reason)` en `inventory-client.ts` (Task 4) y que el `<input>` de motivo en `inventory-screen.tsx` (Task 5); `SETTING_USD_PEN_RATE` se define una sola vez en `settings.service.ts` (Task 1) y la reusan `inventory.service.ts` (Tasks 1–3) sin redefinirla.
