# Catálogo (Sprint 2, módulo 1 de 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer el catálogo público (listado con búsqueda/filtro/paginación, ficha de producto con planes y precios, categorías) consumiendo el esquema ya creado en Sprint 1, sin tocar auth/orders.

**Architecture:** Módulo Nest nuevo `catalog/` con un solo servicio que resuelve tres lecturas (listado, ficha, categorías) vía SQL crudo sobre `products`/`plans`/`plan_prices`/`v_plan_stock` — mismo estilo que `OrdersService`. Sin caché, sin mutaciones, sin autenticación (rutas `@Public()`).

**Tech Stack:** NestJS 11, TypeORM 0.3 (`DataSource.query`, migración nueva), `class-validator`/`class-transformer`, Jest + Supertest contra Postgres/Redis reales (e2e).

**Spec:** `docs/02-requerimientos-funcionales.md` (RF-CAT-01..07), `docs/06-api.md` (sección "Catálogo (Sprint 2)"), `docs/05-modelo-de-datos.md` (cálculo de `stockState`, D29), `docs/09-decisiones-y-preguntas-abiertas.md` (D61 multi-moneda).

## Global Constraints

- Dinero en céntimos enteros; nunca se expone cantidad exacta de stock, solo `stockState` (D29).
- DTOs con `class-validator`, `whitelist: true` global (`configure-app.ts`) → campos desconocidos dan 400.
- Listados paginados: `?page=1&pageSize=20` (máx. 50) → `{items, total, page, pageSize}` (regla transversal de `docs/06`).
- Entidades/rutas/código en inglés; mensajes al usuario en español.
- Cambios de esquema = migración nueva, generada con `npm run migration:generate` (nunca editar una ya aplicada).
- Flujos de solo lectura sin estado/dinero/stock mutable: basta con pruebas e2e del endpoint (no se requiere la prueba de concurrencia de Sprint 1).
- Todo el código vive bajo `backend/`; los comandos de este plan asumen `cd backend` ya hecho.

---

### Task 1: Campos de contenido en `Product` + migración

**Files:**
- Modify: `backend/src/database/entities/product.entity.ts`
- Create: `backend/src/database/migrations/<timestamp>-AddProductContentFields.ts` (generado, no escrito a mano)
- Modify: `docs/05-modelo-de-datos.md` (fila de `products`)

**Interfaces:**
- Produces: columnas nuevas y nullable en `products`: `whatIncluded: string | null`, `compatibility: string | null`, `activationGuide: string | null`, `faq: { question: string; answer: string }[] | null`. Las usa el Task 7 (ficha de producto).

- [ ] **Step 1: Agregar las columnas a la entidad**

En `backend/src/database/entities/product.entity.ts`, después de la columna `description` (línea 26):

```ts
  @Column({ type: 'text', nullable: true })
  whatIncluded!: string | null;

  @Column({ type: 'text', nullable: true })
  compatibility!: string | null;

  @Column({ type: 'text', nullable: true })
  activationGuide!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  faq!: { question: string; answer: string }[] | null;
```

(RF-CAT-03: la ficha necesita "qué incluye, compatibilidad, cómo activar, preguntas frecuentes" como secciones propias, no como texto libre dentro de `description`.)

- [ ] **Step 2: Generar la migración**

Con Postgres/Redis arriba (`docker compose up -d`) y las migraciones de Sprint 1 ya aplicadas:

Run: `npm run migration:generate -- src/database/migrations/AddProductContentFields`

Expected: crea `src/database/migrations/<timestamp>-AddProductContentFields.ts` con un `ALTER TABLE "products" ADD COLUMN ...` para las 4 columnas nuevas (todas nullable, sin `DROP`/`ALTER` sobre columnas existentes). Revisa el archivo generado antes de continuar: si TypeORM agrega algo fuera de estas 4 columnas, detente y avisa (no debería haber drift).

- [ ] **Step 3: Aplicar la migración**

Run: `npm run migration:run`

Expected: log `AddProductContentFields<timestamp> has been executed successfully`.

- [ ] **Step 4: Actualizar `docs/05-modelo-de-datos.md`**

En la fila de `products` de la tabla "Tablas" (línea 44), agregar al final de "Columnas relevantes": `, whatIncluded/compatibility/activationGuide (text, nullable), faq (jsonb, nullable: [{question, answer}])`.

- [ ] **Step 5: Commit**

```bash
git add src/database/entities/product.entity.ts src/database/migrations/*-AddProductContentFields.ts ../docs/05-modelo-de-datos.md
git commit -m "Backend: agrega contenido estructurado de ficha a products (RF-CAT-03)"
```

---

### Task 2: DTOs de paginación reutilizables

**Files:**
- Create: `backend/src/common/dto/pagination-query.dto.ts`
- Create: `backend/src/common/dto/paginated-response.dto.ts`
- Test: `backend/src/common/dto/pagination-query.dto.spec.ts`

**Interfaces:**
- Produces: `PaginationQueryDto { page: number; pageSize: number }` (defaults 1/20, máx. `pageSize` 50) y `PaginatedResponseDto<T>.from(items, total, page, pageSize)`. Los consume `CatalogQueryDto` (Task 4) y `CatalogService.listProducts` (Task 6). Pensado para reusarse en listados futuros (inventario/pagos admin, Sprint 3).

- [ ] **Step 1: Escribir la prueba (falla primero)**

`backend/src/common/dto/pagination-query.dto.spec.ts`:

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination-query.dto';

describe('PaginationQueryDto', () => {
  it('usa page=1 y pageSize=20 por defecto', async () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza pageSize mayor a 50', async () => {
    const dto = plainToInstance(PaginationQueryDto, { pageSize: '51' });
    const errors = await validate(dto);
    expect(errors[0]?.property).toBe('pageSize');
  });

  it('rechaza page menor a 1', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: '0' });
    const errors = await validate(dto);
    expect(errors[0]?.property).toBe('page');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- pagination-query.dto.spec.ts`
Expected: FAIL (`Cannot find module './pagination-query.dto'`).

- [ ] **Step 3: Implementar**

`backend/src/common/dto/pagination-query.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un número entero' })
  @Min(1, { message: 'page debe ser mayor o igual a 1' })
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize debe ser un número entero' })
  @Min(1, { message: 'pageSize debe ser mayor o igual a 1' })
  @Max(50, { message: 'pageSize admite hasta 50' })
  pageSize = 20;
}
```

`backend/src/common/dto/paginated-response.dto.ts`:

```ts
export class PaginatedResponseDto<T> {
  items!: T[];
  total!: number;
  page!: number;
  pageSize!: number;

  static from<T>(
    items: T[],
    total: number,
    page: number,
    pageSize: number,
  ): PaginatedResponseDto<T> {
    return { items, total, page, pageSize };
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- pagination-query.dto.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/common/dto/
git commit -m "Backend: DTOs de paginación reutilizables para listados"
```

---

### Task 3: `aggregateStockState` (lógica pura) + test unitario

**Files:**
- Create: `backend/src/catalog/stock-state.util.ts`
- Test: `backend/src/catalog/stock-state.util.spec.ts`

**Interfaces:**
- Consumes: `StockState` de `../database/views/plan-stock.view` (`'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK'`).
- Produces: `aggregateStockState(states: StockState[]): StockState`. Lo consume `CatalogService.listProducts` (Task 6) para el `stockState` a nivel producto (D69: el mejor estado entre sus planes activos).

- [ ] **Step 1: Escribir la prueba**

`backend/src/catalog/stock-state.util.spec.ts`:

```ts
import { aggregateStockState } from './stock-state.util';

describe('aggregateStockState', () => {
  it('IN_STOCK si al menos un plan está en stock', () => {
    expect(aggregateStockState(['OUT_OF_STOCK', 'IN_STOCK', 'LOW'])).toBe(
      'IN_STOCK',
    );
  });

  it('LOW si ningún plan está en stock pero alguno tiene pocas unidades', () => {
    expect(aggregateStockState(['OUT_OF_STOCK', 'LOW'])).toBe('LOW');
  });

  it('OUT_OF_STOCK si todos los planes están agotados', () => {
    expect(aggregateStockState(['OUT_OF_STOCK', 'OUT_OF_STOCK'])).toBe(
      'OUT_OF_STOCK',
    );
  });

  it('OUT_OF_STOCK si no hay planes', () => {
    expect(aggregateStockState([])).toBe('OUT_OF_STOCK');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- stock-state.util.spec.ts`
Expected: FAIL (`Cannot find module './stock-state.util'`).

- [ ] **Step 3: Implementar**

`backend/src/catalog/stock-state.util.ts`:

```ts
import type { StockState } from '../database/views/plan-stock.view';

const PRIORITY: StockState[] = ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'];

/** El estado agregado del producto es el mejor estado entre sus planes activos (D69). */
export function aggregateStockState(states: StockState[]): StockState {
  for (const state of PRIORITY) {
    if (states.includes(state)) return state;
  }
  return 'OUT_OF_STOCK';
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- stock-state.util.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/stock-state.util.ts src/catalog/stock-state.util.spec.ts
git commit -m "Backend: agrega aggregateStockState (estado de stock a nivel producto, D69)"
```

---

### Task 4: DTOs del módulo catálogo

**Files:**
- Create: `backend/src/catalog/dto/catalog-query.dto.ts`
- Create: `backend/src/catalog/dto/product-detail-query.dto.ts`
- Create: `backend/src/catalog/dto/category-response.dto.ts`
- Create: `backend/src/catalog/dto/product-list-item.dto.ts`
- Create: `backend/src/catalog/dto/product-detail.dto.ts`

**Interfaces:**
- Consumes: `PaginationQueryDto` (Task 2), `CURRENCIES`/`Currency` (`../../database/currency`), `PlanKind` (`../../database/enums`), `StockState` (`../../database/views/plan-stock.view`).
- Produces: todos los tipos que usan `CatalogService` (Task 5-7) y `CatalogController` (Task 5-7): `CatalogQueryDto { page, pageSize, query?, category?, currency }`, `ProductDetailQueryDto { currency }`, `CategoryResponseDto { id, name }`, `ProductListItemDto { id, name, slug, categoryName, priceFromCents, currency, stockState }`, `ProductDetailDto { id, name, slug, description, whatIncluded, compatibility, activationGuide, faq, categoryName, requiresToolUsername, plans: PlanOfferDto[] }`, `PlanOfferDto { id, name, kind, durationDays, prices: PlanPriceDto[], stockState }`, `PlanPriceDto { currency, priceCents }`.

No hay paso de test/implementación separado: son DTOs sin lógica (se validan de punta a punta en los e2e de los Tasks 5-7).

- [ ] **Step 1: `catalog-query.dto.ts`**

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nombre de producto' })
  @IsOptional()
  @IsString({ message: 'query debe ser texto' })
  @Length(1, 80, { message: 'query admite hasta 80 caracteres' })
  query?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id de categoría' })
  @IsOptional()
  @IsUUID('all', { message: 'category debe ser un UUID' })
  category?: string;

  @ApiPropertyOptional({ enum: CURRENCIES, default: 'PEN' })
  @IsOptional()
  @IsIn(CURRENCIES, { message: 'currency debe ser PEN o USD' })
  currency: Currency = 'PEN';
}
```

- [ ] **Step 2: `product-detail-query.dto.ts`**

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CURRENCIES, type Currency } from '../../database/currency';

export class ProductDetailQueryDto {
  @ApiPropertyOptional({ enum: CURRENCIES, default: 'PEN' })
  @IsOptional()
  @IsIn(CURRENCIES, { message: 'currency debe ser PEN o USD' })
  currency: Currency = 'PEN';
}
```

- [ ] **Step 3: `category-response.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
```

- [ ] **Step 4: `product-list-item.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import type { StockState } from '../../database/views/plan-stock.view';

export class ProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @ApiProperty() priceFromCents!: number;
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty({ enum: ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'] })
  stockState!: StockState;
}
```

- [ ] **Step 5: `product-detail.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PlanKind } from '../../database/enums';
import type { StockState } from '../../database/views/plan-stock.view';

export class PlanPriceDto {
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() priceCents!: number;
}

export class PlanOfferDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PlanKind }) kind!: PlanKind;
  @ApiProperty() durationDays!: number;
  @ApiProperty({ type: [PlanPriceDto] }) prices!: PlanPriceDto[];
  @ApiProperty({ enum: ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'] })
  stockState!: StockState;
}

export class ProductDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) whatIncluded!: string | null;
  @ApiProperty({ type: String, nullable: true }) compatibility!: string | null;
  @ApiProperty({ type: String, nullable: true })
  activationGuide!: string | null;
  @ApiProperty({ type: 'array', nullable: true })
  faq!: { question: string; answer: string }[] | null;
  @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @ApiProperty() requiresToolUsername!: boolean;
  @ApiProperty({ type: [PlanOfferDto] }) plans!: PlanOfferDto[];
}
```

- [ ] **Step 6: Commit**

```bash
git add src/catalog/dto/
git commit -m "Backend: DTOs del módulo catalog"
```

---

### Task 5: `GET /catalog/categories`

**Files:**
- Create: `backend/src/catalog/catalog.module.ts`
- Create: `backend/src/catalog/catalog.controller.ts`
- Create: `backend/src/catalog/catalog.service.ts`
- Test: `backend/test/catalog.e2e-spec.ts` (archivo nuevo; los Tasks 6-7 agregan más `it(...)` al mismo `describe`)

**Interfaces:**
- Consumes: `CategoryResponseDto` (Task 4), `DataSource` de TypeORM, `Public` (`../common/decorators/public.decorator`).
- Produces: `CatalogService.listCategories(): Promise<CategoryResponseDto[]>`; `CatalogModule` exportado e importado en `AppModule` (Task 8). El controlador y el módulo los extienden los Tasks 6-7 (mismo archivo, más métodos).

- [ ] **Step 1: Escribir la prueba e2e (falla primero)**

`backend/test/catalog.e2e-spec.ts`:

```ts
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Category } from '../src/database/entities';
import { createTestApp, resetState } from './utils/test-app';

describe('Catálogo', () => {
  let app: NestExpressApplication;
  let ds: DataSource;

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

  describe('GET /catalog/categories', () => {
    it('lista las categorías existentes sin requerir sesión', async () => {
      await ds.getRepository(Category).save([{ name: 'Desbloqueo' }, { name: 'Flasheo' }]);

      const res = await request(app.getHttpServer()).get('/catalog/categories');

      expect(res.status).toBe(200);
      expect(res.body.map((c: { name: string }) => c.name).sort()).toEqual([
        'Desbloqueo',
        'Flasheo',
      ]);
    });

    it('responde una lista vacía si no hay categorías', async () => {
      const res = await request(app.getHttpServer()).get('/catalog/categories');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:e2e -- catalog.e2e-spec.ts`
Expected: FAIL (404, `/catalog/categories` no existe).

- [ ] **Step 3: Implementar servicio, controlador y módulo**

`backend/src/catalog/catalog.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CategoryResponseDto } from './dto/category-response.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly ds: DataSource) {}

  async listCategories(): Promise<CategoryResponseDto[]> {
    return this.ds.query(`SELECT id, name FROM categories ORDER BY name`);
  }
}
```

`backend/src/catalog/catalog.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  listCategories(): Promise<CategoryResponseDto[]> {
    return this.catalog.listCategories();
  }
}
```

`backend/src/catalog/catalog.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:e2e -- catalog.e2e-spec.ts`
Expected: FAIL todavía — `CatalogModule` no está registrado en `AppModule`, así que la ruta sigue sin existir dentro de `createTestApp()`. Agrega temporalmente `CatalogModule` a los `imports` de `backend/src/app.module.ts` (junto a `OrdersModule`) para que esta prueba pase ya; el Task 8 deja ese cambio definitivo y actualiza la documentación.

Run de nuevo: `npm run test:e2e -- catalog.e2e-spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/ src/app.module.ts test/catalog.e2e-spec.ts
git commit -m "Backend: GET /catalog/categories"
```

---

### Task 6: `GET /catalog/products` (listado, búsqueda, filtro, paginación)

**Files:**
- Modify: `backend/src/catalog/catalog.service.ts`
- Modify: `backend/src/catalog/catalog.controller.ts`
- Modify: `backend/test/catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `CatalogQueryDto`, `ProductListItemDto` (Task 4), `PaginatedResponseDto` (Task 2), `aggregateStockState` (Task 3), `createCatalog`/`createUser` factories del Task 6 de pruebas (`./utils/factories`).
- Produces: `CatalogService.listProducts(dto: CatalogQueryDto): Promise<PaginatedResponseDto<ProductListItemDto>>`. Lo consume el Task 7 solo para el patrón, no hay dependencia directa de código.

- [ ] **Step 1: Agregar los casos al e2e (falla primero)**

Agregar dentro de `describe('Catálogo', ...)` en `backend/test/catalog.e2e-spec.ts`, después del bloque de categorías:

```ts
  describe('GET /catalog/products', () => {
    it('lista solo productos activos, con priceFromCents y stockState agregado', async () => {
      const inStock = await createCatalog(ds, { stock: 10, lowStockThreshold: 5, prices: { PEN: 5000 } });
      await createCatalog(ds, { stock: 1, lowStockThreshold: 5, prices: { PEN: 3000 } }); // LOW
      const inactive = await createCatalog(ds, { stock: 10, prices: { PEN: 1000 } });
      await ds.getRepository(Product).update(inactive.product.id, { active: false });

      const res = await request(app.getHttpServer()).get('/catalog/products');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      const names = res.body.items.map((p: { name: string }) => p.name);
      expect(names).not.toContain(inactive.product.name);
      const inStockItem = res.body.items.find(
        (p: { id: string }) => p.id === inStock.product.id,
      );
      expect(inStockItem).toMatchObject({
        priceFromCents: 5000,
        currency: 'PEN',
        stockState: 'IN_STOCK',
      });
    });

    it('busca por nombre y filtra por categoría', async () => {
      const target = await createCatalog(ds, { prices: { PEN: 1000 } });
      await createCatalog(ds, { prices: { PEN: 1000 } });

      const byName = await request(app.getHttpServer()).get(
        `/catalog/products?query=${encodeURIComponent(target.product.name)}`,
      );
      expect(byName.body.total).toBe(1);
      expect(byName.body.items[0].id).toBe(target.product.id);

      const byCategory = await request(app.getHttpServer()).get(
        `/catalog/products?category=${target.product.categoryId}`,
      );
      expect(byCategory.body.total).toBe(1);
      expect(byCategory.body.items[0].id).toBe(target.product.id);
    });

    it('pagina con pageSize y respeta el máximo de 50', async () => {
      for (let i = 0; i < 3; i++) {
        await createCatalog(ds, { prices: { PEN: 1000 } });
      }

      const res = await request(app.getHttpServer()).get(
        '/catalog/products?page=2&pageSize=2',
      );
      expect(res.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(res.body.items).toHaveLength(1);

      const tooBig = await request(app.getHttpServer()).get(
        '/catalog/products?pageSize=51',
      );
      expect(tooBig.status).toBe(400);
    });

    it('no incluye un producto sin precio en la moneda pedida', async () => {
      const usdOnly = await createCatalog(ds, { prices: { USD: 10 } });

      const pen = await request(app.getHttpServer()).get('/catalog/products');
      expect(pen.body.items.map((p: { id: string }) => p.id)).not.toContain(
        usdOnly.product.id,
      );

      const usd = await request(app.getHttpServer()).get(
        '/catalog/products?currency=USD',
      );
      expect(usd.body.items.map((p: { id: string }) => p.id)).toContain(
        usdOnly.product.id,
      );
    });
  });
```

Agregar los imports que falten al inicio del archivo: `import { createCatalog, createUser } from './utils/factories';` y `import { Product } from '../src/database/entities';` (ajusta si ya existen).

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:e2e -- catalog.e2e-spec.ts`
Expected: FAIL (404 en `/catalog/products`, o `undefined` en `res.body.total`).

- [ ] **Step 3: Implementar**

Agregar a `backend/src/catalog/catalog.service.ts` (mismo archivo del Task 5, mismo `DataSource`):

```ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Currency } from '../database/currency';
import type { StockState } from '../database/views/plan-stock.view';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ProductListItemDto } from './dto/product-list-item.dto';
import { aggregateStockState } from './stock-state.util';

@Injectable()
export class CatalogService {
  constructor(private readonly ds: DataSource) {}

  async listCategories(): Promise<CategoryResponseDto[]> {
    return this.ds.query(`SELECT id, name FROM categories ORDER BY name`);
  }

  async listProducts(
    dto: CatalogQueryDto,
  ): Promise<PaginatedResponseDto<ProductListItemDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const params = [dto.currency, dto.query ?? null, dto.category ?? null];

    const rows: {
      id: string;
      name: string;
      slug: string;
      categoryName: string | null;
      priceFromCents: number;
    }[] = await this.ds.query(
      `SELECT pr.id, pr.name, pr.slug, c.name AS "categoryName",
              MIN(pp."priceCents")::int AS "priceFromCents"
         FROM products pr
         LEFT JOIN categories c ON c.id = pr."categoryId"
         JOIN plans pl ON pl."productId" = pr.id AND pl.active = true
         JOIN plan_prices pp ON pp."planId" = pl.id AND pp.currency = $1
        WHERE pr.active = true
          AND ($2::text IS NULL OR pr.name ILIKE '%' || $2 || '%')
          AND ($3::uuid IS NULL OR pr."categoryId" = $3)
        GROUP BY pr.id, pr.name, pr.slug, c.name
        ORDER BY pr.name
        LIMIT $4 OFFSET $5`,
      [...params, dto.pageSize, offset],
    );

    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT COUNT(*) FROM (
         SELECT pr.id
           FROM products pr
           JOIN plans pl ON pl."productId" = pr.id AND pl.active = true
           JOIN plan_prices pp ON pp."planId" = pl.id AND pp.currency = $1
          WHERE pr.active = true
            AND ($2::text IS NULL OR pr.name ILIKE '%' || $2 || '%')
            AND ($3::uuid IS NULL OR pr."categoryId" = $3)
          GROUP BY pr.id
       ) t`,
      params,
    );

    const stockByProduct = await this.stockStatesByProduct(
      rows.map((row) => row.id),
    );

    const items: ProductListItemDto[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      categoryName: row.categoryName,
      priceFromCents: row.priceFromCents,
      currency: dto.currency,
      stockState: aggregateStockState(stockByProduct.get(row.id) ?? []),
    }));

    return PaginatedResponseDto.from(
      items,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }

  private async stockStatesByProduct(
    productIds: string[],
  ): Promise<Map<string, StockState[]>> {
    const map = new Map<string, StockState[]>();
    if (productIds.length === 0) return map;

    const rows: { productId: string; stockState: StockState }[] =
      await this.ds.query(
        `SELECT pl."productId", vs."stockState"
           FROM plans pl
           JOIN v_plan_stock vs ON vs."planId" = pl.id
          WHERE pl.active = true AND pl."productId" = ANY($1::uuid[])`,
        [productIds],
      );
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(row.stockState);
      map.set(row.productId, list);
    }
    return map;
  }
}
```

Nota: `Currency` ya no se usa como tipo en este archivo salvo en el `Map`; no elimines el import si lo necesitas para anotar `dto.currency` — TypeScript lo exige por el DTO.

Agregar a `backend/src/catalog/catalog.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { ProductListItemDto } from './dto/product-list-item.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  listProducts(
    @Query() query: CatalogQueryDto,
  ): Promise<PaginatedResponseDto<ProductListItemDto>> {
    return this.catalog.listProducts(query);
  }

  @Get('categories')
  listCategories(): Promise<CategoryResponseDto[]> {
    return this.catalog.listCategories();
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:e2e -- catalog.e2e-spec.ts`
Expected: PASS (todos los tests de categorías y productos).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/ test/catalog.e2e-spec.ts
git commit -m "Backend: GET /catalog/products con búsqueda, categoría y paginación (RF-CAT-01/02/05/06)"
```

---

### Task 7: `GET /catalog/products/:slug` (ficha con planes)

**Files:**
- Modify: `backend/src/catalog/catalog.service.ts`
- Modify: `backend/src/catalog/catalog.controller.ts`
- Modify: `backend/test/catalog.e2e-spec.ts`

**Interfaces:**
- Consumes: `ProductDetailDto`, `PlanOfferDto`, `PlanPriceDto`, `ProductDetailQueryDto` (Task 4).
- Produces: `CatalogService.getProductBySlug(slug: string, currency: Currency): Promise<ProductDetailDto>`. Último endpoint del módulo; no lo consume ningún task posterior de este plan.

- [ ] **Step 1: Agregar los casos al e2e**

Agregar dentro de `describe('Catálogo', ...)`:

```ts
  describe('GET /catalog/products/:slug', () => {
    it('devuelve la ficha con sus planes y precios', async () => {
      const catalog = await createCatalog(ds, {
        stock: 10,
        lowStockThreshold: 5,
        prices: { PEN: 5000, USD: 1500 },
        requiresToolUsername: true,
      });
      await ds.getRepository(Product).update(catalog.product.id, {
        whatIncluded: 'Clave + guía',
        compatibility: 'Android 10+',
        activationGuide: 'Abre la app y pega la clave',
        faq: [{ question: '¿Cuánto dura?', answer: '30 días' }],
      });

      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: catalog.product.id,
        slug: catalog.product.slug,
        whatIncluded: 'Clave + guía',
        compatibility: 'Android 10+',
        activationGuide: 'Abre la app y pega la clave',
        faq: [{ question: '¿Cuánto dura?', answer: '30 días' }],
        requiresToolUsername: true,
      });
      expect(res.body.plans).toHaveLength(1);
      expect(res.body.plans[0]).toMatchObject({
        id: catalog.plan.id,
        stockState: 'IN_STOCK',
      });
      expect(res.body.plans[0].prices.sort((a: { currency: string }, b: { currency: string }) =>
        a.currency.localeCompare(b.currency),
      )).toEqual([
        { currency: 'PEN', priceCents: 5000 },
        { currency: 'USD', priceCents: 1500 },
      ]);
    });

    it('responde 404 si el slug no existe o el producto está inactivo', async () => {
      const notFound = await request(app.getHttpServer()).get(
        '/catalog/products/no-existe',
      );
      expect(notFound.status).toBe(404);

      const inactive = await createCatalog(ds, { prices: { PEN: 1000 } });
      await ds.getRepository(Product).update(inactive.product.id, { active: false });
      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${inactive.product.slug}`,
      );
      expect(res.status).toBe(404);
    });

    it('omite planes sin precio en ninguna moneda', async () => {
      const catalog = await createCatalog(ds, { prices: { PEN: 1000 } });
      await ds.query(`DELETE FROM plan_prices WHERE "planId" = $1`, [
        catalog.plan.id,
      ]);

      const res = await request(app.getHttpServer()).get(
        `/catalog/products/${catalog.product.slug}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.plans).toEqual([]);
    });
  });
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:e2e -- catalog.e2e-spec.ts`
Expected: FAIL (404 en la ruta nueva, no implementada).

- [ ] **Step 3: Implementar**

Agregar a `backend/src/catalog/catalog.service.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
// ...
import { PlanOfferDto, PlanPriceDto, ProductDetailDto } from './dto/product-detail.dto';

// dentro de la clase CatalogService:
  async getProductBySlug(
    slug: string,
    currency: Currency,
  ): Promise<ProductDetailDto> {
    const [product]: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      whatIncluded: string | null;
      compatibility: string | null;
      activationGuide: string | null;
      faq: { question: string; answer: string }[] | null;
      categoryName: string | null;
      requiresToolUsername: boolean;
    }[] = await this.ds.query(
      `SELECT pr.id, pr.name, pr.slug, pr.description, pr."whatIncluded",
              pr.compatibility, pr."activationGuide", pr.faq,
              c.name AS "categoryName", pr."requiresToolUsername"
         FROM products pr
         LEFT JOIN categories c ON c.id = pr."categoryId"
        WHERE pr.slug = $1 AND pr.active = true`,
      [slug],
    );
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const rows: {
      id: string;
      name: string;
      kind: string;
      durationDays: number;
      stockState: StockState;
      currency: Currency | null;
      priceCents: number | null;
    }[] = await this.ds.query(
      `SELECT pl.id, pl.name, pl.kind, pl."durationDays", vs."stockState",
              pp.currency, pp."priceCents"
         FROM plans pl
         JOIN v_plan_stock vs ON vs."planId" = pl.id
         LEFT JOIN plan_prices pp ON pp."planId" = pl.id
        WHERE pl."productId" = $1 AND pl.active = true
        ORDER BY pl."durationDays", pp.currency`,
      [product.id],
    );

    const plansById = new Map<string, PlanOfferDto>();
    for (const row of rows) {
      const plan = plansById.get(row.id) ?? {
        id: row.id,
        name: row.name,
        kind: row.kind as PlanOfferDto['kind'],
        durationDays: row.durationDays,
        prices: [] as PlanPriceDto[],
        stockState: row.stockState,
      };
      if (row.currency && row.priceCents !== null) {
        plan.prices.push({ currency: row.currency, priceCents: row.priceCents });
      }
      plansById.set(row.id, plan);
    }

    return {
      ...product,
      plans: [...plansById.values()].filter((plan) => plan.prices.length > 0),
    };
  }
```

Agregar a `backend/src/catalog/catalog.controller.ts`:

```ts
  @Get('products/:slug')
  getProduct(
    @Param('slug') slug: string,
    @Query() query: ProductDetailQueryDto,
  ): Promise<ProductDetailDto> {
    return this.catalog.getProductBySlug(slug, query.currency);
  }
```

(agrega `Param` a los imports de `@nestjs/common` y `ProductDetailQueryDto`/`ProductDetailDto` a los imports de DTOs; la variable `currency` del `import type { Currency }` del servicio ya existe del Task 6).

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:e2e -- catalog.e2e-spec.ts`
Expected: PASS (todos los `it` del archivo, categorías + productos + ficha).

- [ ] **Step 5: Correr toda la suite antes de seguir**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: todo en verde (no debe haber roto `orders`/`auth`/`db-logic`, que no se tocaron).

- [ ] **Step 6: Commit**

```bash
git add src/catalog/ test/catalog.e2e-spec.ts
git commit -m "Backend: GET /catalog/products/:slug con ficha y planes (RF-CAT-03/04/07)"
```

---

### Task 8: Dejar `CatalogModule` definitivo + actualizar documentación

**Files:**
- Modify: `backend/src/app.module.ts` (confirmar import, ya agregado "temporalmente" en el Task 5)
- Modify: `docs/02-requerimientos-funcionales.md` (RF-CAT-01..07)
- Modify: `docs/06-api.md` (sección "Catálogo (Sprint 2)")
- Modify: `docs/08-plan-de-sprints.md` (checkbox de "Módulo catalog")
- Modify: `docs/09-decisiones-y-preguntas-abiertas.md` (nuevas decisiones D66-D69)

**Interfaces:** ninguna — task de cierre, sin código nuevo.

- [ ] **Step 1: Confirmar el registro del módulo**

En `backend/src/app.module.ts`, verificar que el import quede ordenado alfabéticamente junto a los demás (`AuthModule`, `CatalogModule`, `OrdersModule`):

```ts
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
// ...
    AuthModule,
    CatalogModule,
    OrdersModule,
```

- [ ] **Step 2: Actualizar `docs/09-decisiones-y-preguntas-abiertas.md`**

Agregar al final de la tabla de la sección "Decisiones de la segunda ronda" (después de D55):

```markdown
| D66 | El listado de catálogo (`GET /catalog/products`) usa `currency=PEN` por defecto si no se pasa `?currency`; solo se listan productos con al menos un plan activo con precio en esa moneda. | Coincide con la moneda principal del negocio; evita mostrar productos no comprables en la moneda pedida. |
| D67 | El filtro `category` del catálogo recibe el **id** de la categoría (UUID), no su nombre. | `categories` no tiene slug propio; evita ambigüedad con nombres duplicados o acentos. |
| D68 | La ficha de producto (RF-CAT-03) usa columnas propias (`whatIncluded`, `compatibility`, `activationGuide`, `faq`) en vez de un solo `description` libre. | Permite que el panel admin (CRUD de catálogo, Sprint 2) edite cada sección por separado y el frontend las muestre con su propio diseño. |
| D69 | El `stockState` agregado a nivel producto en el listado es el **mejor** estado entre sus planes activos (si algún plan está "En stock", el producto se muestra "En stock" aunque otro esté agotado). | Evita ocultar o marcar como agotado un producto que sí se puede comprar por otro plan/duración. |
```

- [ ] **Step 3: Actualizar `docs/06-api.md`**

Reemplazar la tabla de "Catálogo (Sprint 2)" (líneas 29-34) con el estado implementado y las rutas finales:

```markdown
## Catálogo (Sprint 2)
| | Ruta | Acceso | Notas |
|---|---|---|---|
| ✅ | `GET /catalog/products?query=&category=&currency=&page=&pageSize=` | 🌐 | Productos activos con `priceFromCents` (en la moneda pedida, PEN por defecto, D66), `categoryName` y `stockState` agregado (D69). `category` es el id de la categoría (D67). Paginado `{items, total, page, pageSize}`. |
| ✅ | `GET /catalog/products/:slug?currency=` | 🌐 | Ficha: `description`, `whatIncluded`, `compatibility`, `activationGuide`, `faq` (D68) y `plans: [{id, name, kind, durationDays, prices: [{currency, priceCents}], stockState}]`. Solo planes con al menos un precio. Nunca expone cantidad exacta (D29). 404 si el slug no existe o el producto está inactivo. |
| ✅ | `GET /catalog/categories` | 🌐 | `[{id, name}]` ordenadas por nombre. |
```

- [ ] **Step 4: Actualizar `docs/02-requerimientos-funcionales.md`**

Cambiar el estado de RF-CAT-01, RF-CAT-02, RF-CAT-03, RF-CAT-04, RF-CAT-05, RF-CAT-06 de `⬜` a `✅` (líneas 40-45); dejar RF-CAT-07 como ya estaba (`✅`, implementado en Sprint 1).

Actualizar la nota de verificación al inicio del archivo (línea 3-5) agregando RF-CAT-01..06 a la lista de lo ya verificado contra `backend/src/`.

- [ ] **Step 5: Actualizar `docs/08-plan-de-sprints.md`**

Marcar como hecho el primer ítem de Sprint 2 (línea 48):

```markdown
- [x] Módulo `catalog`: listado, búsqueda, categorías, ficha con planes, `stockState` solo por estado (RF-CAT-01..07, D29).
```

- [ ] **Step 6: Commit**

```bash
git add src/app.module.ts ../docs/02-requerimientos-funcionales.md ../docs/06-api.md ../docs/08-plan-de-sprints.md ../docs/09-decisiones-y-preguntas-abiertas.md
git commit -m "Docs: catálogo (Sprint 2) implementado — RF-CAT-01..07, D66-D69"
```

---

## Qué sigue (fuera de este plan)

Próximos módulos de Sprint 2, en orden, cada uno con su propio plan: `storage` (URLs firmadas R2), `payments` (subir comprobante + bloqueo de duplicados), CRUD admin de catálogo (D38), verificación de correo + `POST /auth/google` (D53/D54). Ver `docs/08-plan-de-sprints.md`.
