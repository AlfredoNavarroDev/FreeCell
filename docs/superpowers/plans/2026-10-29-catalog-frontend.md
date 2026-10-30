# Catálogo del frontend conectado a la API real — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar la pantalla S1 (Catálogo, `frontend/`) a la API real del backend — reemplaza `src/lib/mock-catalog.ts`
por datos reales de `GET /catalog/products`, `GET /catalog/categories`, `GET /payment-methods`, con la dirección
visual violeta/bento/glass aprobada, orden (`sort`) nuevo en el backend, y las secciones de confianza/cómo-comprar
con contenido real (sin métricas inventadas).

**Architecture:** Server Components de Next.js para la lectura (fetch en `app/page.tsx`, pasa datos ya resueltos
a los componentes hijos); único cliente interactivo (`"use client"`) es el `<select>` de orden, que navega vía
`router.push` preservando los demás filtros. Filtro de categoría y búsqueda son navegación pura (`<Link>`/`<form
method="GET">`), sin JS. Un endpoint de backend existente (`GET /catalog/products`) gana un parámetro `sort`.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, TypeScript, Tailwind v4 (`@theme`), Vitest
(unit del lado frontend) · NestJS 11 + TypeORM + PostgreSQL (lado backend), Jest e2e.

**Spec:** `docs/superpowers/specs/2026-10-29-catalog-frontend-design.md`

## Global Constraints

- Violeta de marca: `#6D28D9` (primario) / `#7C3AED` (hover) / `#5B21B6` (press) / `#F5F3FF` (fondo suave).
- Colores de estado — **nunca** usar violeta para esto, siempre texto + color: éxito `#067647`/`#DCFAE6`,
  advertencia `#93370D`/`#FEF0C7`, crítico `#B42318`/`#FEE4E2`.
  `StockState` del backend es `'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK'` (no `'LOW_STOCK'`).
  **Nunca** mostrar la cantidad exacta de stock, solo el estado (D29).
- Tipografía: Space Grotesk (`font-display`) para títulos/precios, IBM Plex Sans (`font-sans`) para el resto —
  ya cargadas en el proyecto, no agregar imports de fuentes nuevos.
- Radios: `8px` controles/badges, `16px` tarjetas (`rounded-2xl`), `24px` hero. Glassmorphism **solo** en la
  tarjeta flotante del hero — en ningún otro componente.
- **Nunca inventar métricas** (SLA en minutos, porcentajes de efectividad, ratings, conteos de usuarios). Los
  únicos números permitidos son: reales (vienen de la API, ej. `total` de productos) o políticas ya decididas:
  reposición de clave **7 días** (D25), reserva de carrito **30 minutos**.
- `GET /catalog/products` acepta `sort` ∈ `'price_asc' | 'price_desc' | 'newest'` — sin opción "más populares"
  (no hay datos de ventas agregados todavía).
- La card de producto del listado **no** linkea a `/p/[slug]` ni tiene botón "Comprar ahora" — esa ruta no existe
  todavía (paso 3 del roadmap). Es informativa: nombre, categoría, "Desde S/X", 1 badge de stock.
- `process.env.API_URL` (sin prefijo `NEXT_PUBLIC_`) es la base del backend — todo el fetching de este plan es
  server-side.

---

## Task 1: Backend — `sort` en `GET /catalog/products`

**Files:**
- Modify: `backend/src/catalog/dto/catalog-query.dto.ts`
- Modify: `backend/src/catalog/catalog.service.ts`
- Test: `backend/test/catalog.e2e-spec.ts`
- Modify: `docs/06-api.md` (fila de `GET /catalog/products`)

**Interfaces:**
- Produces: `CatalogQueryDto.sort?: 'price_asc' | 'price_desc' | 'newest'` — lo consume `CatalogService.listProducts`.
  Nada del frontend depende de este tipo (el frontend define su propio `CatalogSort` en Task 3, mismos 3 valores).

- [ ] **Step 1: Escribir el test que falla**

Agregar al final del `describe('GET /catalog/products', ...)` existente en `backend/test/catalog.e2e-spec.ts`:

```ts
    it('ordena por precio ascendente/descendente con sort=price_asc|price_desc', async () => {
      const barato = await createCatalog(ds, { prices: { PEN: 1000 } });
      const caro = await createCatalog(ds, { prices: { PEN: 9000 } });

      const asc = await request(app.getHttpServer()).get(
        '/catalog/products?sort=price_asc',
      );
      const ids = (asc.body as { items: { id: string }[] }).items.map(
        (p) => p.id,
      );
      expect(ids.indexOf(barato.product.id)).toBeLessThan(
        ids.indexOf(caro.product.id),
      );

      const desc = await request(app.getHttpServer()).get(
        '/catalog/products?sort=price_desc',
      );
      const idsDesc = (desc.body as { items: { id: string }[] }).items.map(
        (p) => p.id,
      );
      expect(idsDesc.indexOf(caro.product.id)).toBeLessThan(
        idsDesc.indexOf(barato.product.id),
      );
    });

    it('ordena por más recientes con sort=newest', async () => {
      const viejo = await createCatalog(ds, { prices: { PEN: 1000 } });
      const nuevo = await createCatalog(ds, { prices: { PEN: 1000 } });
      await ds.query(
        `UPDATE products SET "createdAt" = now() - interval '1 day' WHERE id = $1`,
        [viejo.product.id],
      );

      const res = await request(app.getHttpServer()).get(
        '/catalog/products?sort=newest',
      );
      const ids = (res.body as { items: { id: string }[] }).items.map(
        (p) => p.id,
      );
      expect(ids.indexOf(nuevo.product.id)).toBeLessThan(
        ids.indexOf(viejo.product.id),
      );
    });

    it('responde 400 si sort no es un valor válido', async () => {
      const res = await request(app.getHttpServer()).get(
        '/catalog/products?sort=mas_vendidos',
      );
      expect(res.status).toBe(400);
    });
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd backend
TEST_DATABASE_URL="postgresql://freecell:freecell@localhost:5433/licencias_test" TEST_REDIS_URL="redis://localhost:6380/1" npm run test:e2e -- catalog.e2e-spec.ts
```

(Ajustar host/puerto de Postgres/Redis de test a los que use tu máquina — ver `backend/.env`, sección
`DB_PORT`/`REDIS_PORT`, si 5432/6379 están ocupados por un Postgres/Redis nativo.)

Esperado: los 3 tests nuevos fallan — `price_asc`/`price_desc`/`newest` dan el mismo orden (por nombre, no hay
`sort` implementado todavía) y el de `sort=mas_vendidos` responde 200 en vez de 400 (el DTO no valida `sort`
porque el campo no existe).

- [ ] **Step 3: Implementar — DTO**

En `backend/src/catalog/dto/catalog-query.dto.ts`, agregar el campo (después de `currency`):

```ts
  @ApiPropertyOptional({ enum: ['price_asc', 'price_desc', 'newest'] })
  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'newest'], {
    message: 'sort no es un valor válido',
  })
  sort?: 'price_asc' | 'price_desc' | 'newest';
```

- [ ] **Step 4: Implementar — servicio**

En `backend/src/catalog/catalog.service.ts`, dentro de `listProducts`, antes de construir `rows` agregar:

```ts
    const ORDER_BY: Record<string, string> = {
      price_asc: 'MIN(pp."priceCents") ASC, pr.name',
      price_desc: 'MIN(pp."priceCents") DESC, pr.name',
      newest: 'pr."createdAt" DESC, pr.name',
    };
    const orderBy = ORDER_BY[dto.sort ?? ''] ?? 'pr.name';
```

Y cambiar la query de `rows` para usar `${orderBy}` en vez del `ORDER BY pr.name` fijo (el resto de la query
no cambia):

```ts
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
        ORDER BY ${orderBy}
        LIMIT $4 OFFSET $5`,
      [...params, dto.pageSize, offset],
    );
```

`orderBy` nunca contiene texto del cliente sin pasar por el mapa `ORDER_BY` (whitelist fija de 3 valores +
default), así que no hay riesgo de inyección SQL aunque se interpole directo en el template string.

- [ ] **Step 5: Correr el test y verificar que pasa**

Mismo comando del Step 2. Esperado: los 4 tests nuevos pasan (los 3 casos de orden + el 400 de `IsIn`), y el
resto de `catalog.e2e-spec.ts` sigue en verde.

- [ ] **Step 6: Documentar**

En `docs/06-api.md`, en la fila de `GET /catalog/products?query=&category=&currency=&page=&pageSize=`, agregar
`sort=` a la lista de query params del encabezado de fila y una frase: "`sort` opcional
(`price_asc`\|`price_desc`\|`newest`); sin él, se ordena por nombre."

- [ ] **Step 7: Commit**

```bash
git add backend/src/catalog/dto/catalog-query.dto.ts backend/src/catalog/catalog.service.ts backend/test/catalog.e2e-spec.ts docs/06-api.md
git commit -m "Backend: GET /catalog/products admite sort=price_asc|price_desc|newest"
```

---

## Task 2: Tokens de diseño — violeta en `globals.css`

**Files:**
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Produces: clases Tailwind `bg-accent-hover`, `text-accent-hover`, `bg-accent-press`, `text-accent-press`
  (nuevas, usadas en Task 8). Las clases ya existentes (`bg-accent`, `bg-accent-soft-bg`, `text-accent-soft-ink`,
  `text-ink`, `text-muted`, `bg-surface`, `border-line*`) no cambian de nombre, solo de valor.

No hay lógica que testear (son variables CSS). La verificación es el build de Task 10 en adelante — este task
solo deja el cambio escrito y confirma que no rompe el build actual.

- [ ] **Step 1: Editar los tokens**

Reemplazar el bloque `:root { ... }` completo de `frontend/src/app/globals.css` por:

```css
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --line-soft: #eaecf0;
  --line-strong: #d0d5dd;
  --accent: #6d28d9;
  --accent-hover: #7c3aed;
  --accent-press: #5b21b6;
  --accent-soft-bg: #f5f3ff;
  --accent-soft-ink: #5b21b6;
  --success-ink: #067647;
  --success-bg: #dcfae6;
  --warning-ink: #93370d;
  --warning-bg: #fef0c7;
  --danger-ink: #b42318;
  --danger-bg: #fee4e2;
  --focus-ring: #7db3ff;
}
```

Y el bloque `@theme inline { ... }` por:

```css
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --color-line-soft: var(--line-soft);
  --color-line-strong: var(--line-strong);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-press: var(--accent-press);
  --color-accent-soft-bg: var(--accent-soft-bg);
  --color-accent-soft-ink: var(--accent-soft-ink);
  --color-success-ink: var(--success-ink);
  --color-success-bg: var(--success-bg);
  --color-warning-ink: var(--warning-ink);
  --color-warning-bg: var(--warning-bg);
  --color-danger-ink: var(--danger-ink);
  --color-danger-bg: var(--danger-bg);
  --font-display: var(--font-space-grotesk);
  --font-sans: var(--font-ibm-plex-sans);
}
```

El resto del archivo (`body { ... }`, `:focus-visible { ... }`) no cambia.

- [ ] **Step 2: Verificar que el proyecto sigue compilando**

```bash
cd frontend
npm run build
```

Esperado: build exitoso (las páginas existentes usan `bg-accent`/`text-ink`/etc., que siguen existiendo, solo
con otro valor — no hay referencias rotas).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "Frontend: tokens de diseño pasan a violeta (direccion visual aprobada)"
```

---

## Task 3: Fetch layer — `catalog-client.ts` + `format.ts`

**Files:**
- Create: `frontend/src/lib/catalog-client.ts`
- Create: `frontend/src/lib/catalog-client.test.ts`
- Create: `frontend/src/lib/format.ts`
- Create: `frontend/src/lib/format.test.ts`

**Interfaces:**
- Produces (usado por Tasks 4, 5, 6, 8, 10):
  ```ts
  type Currency = "PEN" | "USD";
  type StockState = "IN_STOCK" | "LOW" | "OUT_OF_STOCK";
  type CatalogSort = "price_asc" | "price_desc" | "newest";

  interface CatalogCategory { id: string; name: string }
  interface CatalogProductListItem {
    id: string; name: string; slug: string;
    categoryName: string | null; priceFromCents: number;
    currency: Currency; stockState: StockState;
  }
  interface CatalogProductsResult {
    items: CatalogProductListItem[]; total: number; page: number; pageSize: number;
  }
  interface PaymentMethod {
    id: string; code: string; name: string;
    kind: "WALLET" | "BANK_TRANSFER" | "CRYPTO";
    currencies: Currency[]; active: boolean;
  }

  function fetchCatalogProducts(params: {
    query?: string; category?: string; sort?: CatalogSort; pageSize?: number;
  }): Promise<CatalogProductsResult>;
  function fetchCatalogCategories(): Promise<CatalogCategory[]>;
  function fetchPaymentMethods(): Promise<PaymentMethod[]>;

  // format.ts
  function formatPriceCents(cents: number, currency?: Currency): string;
  ```

### Parte A: `format.ts` (sin dependencias, primero)

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPriceCents } from "./format";

describe("formatPriceCents", () => {
  it("formatea céntimos en soles con dos decimales", () => {
    expect(formatPriceCents(8900, "PEN")).toBe("S/ 89.00");
  });

  it("formatea céntimos en dólares con dos decimales", () => {
    expect(formatPriceCents(1500, "USD")).toBe("$ 15.00");
  });

  it("usa soles por defecto si no se pasa moneda", () => {
    expect(formatPriceCents(100)).toBe("S/ 1.00");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend
npm run test:unit -- format.test.ts
```

Esperado: FAIL — `Cannot find module './format'` (el archivo no existe todavía).

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/format.ts`:

```ts
import type { Currency } from "./catalog-client";

const CURRENCY_SYMBOL: Record<Currency, string> = {
  PEN: "S/",
  USD: "$",
};

export function formatPriceCents(cents: number, currency: Currency = "PEN"): string {
  const amount = (cents / 100).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOL[currency]} ${amount}`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npm run test:unit -- format.test.ts
```

Esperado: 3 tests en verde. (El import de `Currency` desde `./catalog-client` todavía no existe — se resuelve
en la Parte B de este mismo task; hasta entonces TypeScript marcará error de módulo faltante, pero Vitest con
`esbuild`/`ts-node` igual ejecuta si el tipo no se usa en runtime. Si el test falla por el import, escribir
primero la Parte B.)

### Parte B: `catalog-client.ts`

- [ ] **Step 5: Escribir el test que falla**

Crear `frontend/src/lib/catalog-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  fetchPaymentMethods,
} from "./catalog-client";

describe("fetchCatalogProducts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arma la URL con query, category, sort y pageSize", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCatalogProducts({ query: "unlock", category: "cat-1", sort: "price_asc", pageSize: 50 });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/catalog/products?");
    expect(calledUrl).toContain("query=unlock");
    expect(calledUrl).toContain("category=cat-1");
    expect(calledUrl).toContain("sort=price_asc");
    expect(calledUrl).toContain("pageSize=50");
  });

  it("omite parámetros no provistos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchCatalogProducts({});

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("query=");
    expect(calledUrl).not.toContain("category=");
    expect(calledUrl).not.toContain("sort=");
  });

  it("devuelve los productos parseados del backend", async () => {
    const payload = {
      items: [
        {
          id: "p1",
          name: "UnlockTool",
          slug: "unlocktool",
          categoryName: "Desbloqueo",
          priceFromCents: 8900,
          currency: "PEN",
          stockState: "IN_STOCK",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCatalogProducts({});

    expect(result).toEqual(payload);
  });

  it("lanza un error si el backend responde con un status de error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCatalogProducts({})).rejects.toThrow();
  });
});

describe("fetchCatalogCategories", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve las categorías del backend", async () => {
    const payload = [{ id: "c1", name: "Desbloqueo" }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCatalogCategories();

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/catalog/categories"),
      expect.anything(),
    );
  });
});

describe("fetchPaymentMethods", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pide los métodos de pago en soles por defecto", async () => {
    const payload = [
      { id: "m1", code: "yape", name: "Yape", kind: "WALLET", currencies: ["PEN"], active: true },
    ];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPaymentMethods();

    expect(result).toEqual(payload);
    expect((fetchMock.mock.calls[0][0] as string)).toContain("currency=PEN");
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

```bash
npm run test:unit -- catalog-client.test.ts
```

Esperado: FAIL — `Cannot find module './catalog-client'`.

- [ ] **Step 7: Implementar**

Crear `frontend/src/lib/catalog-client.ts`:

```ts
export type Currency = "PEN" | "USD";
export type StockState = "IN_STOCK" | "LOW" | "OUT_OF_STOCK";
export type CatalogSort = "price_asc" | "price_desc" | "newest";

export interface CatalogCategory {
  id: string;
  name: string;
}

export interface CatalogProductListItem {
  id: string;
  name: string;
  slug: string;
  categoryName: string | null;
  priceFromCents: number;
  currency: Currency;
  stockState: StockState;
}

export interface CatalogProductsResult {
  items: CatalogProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  kind: "WALLET" | "BANK_TRANSFER" | "CRYPTO";
  currencies: Currency[];
  active: boolean;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar ${path}`);
  }
  return (await res.json()) as T;
}

export async function fetchCatalogProducts(params: {
  query?: string;
  category?: string;
  sort?: CatalogSort;
  pageSize?: number;
}): Promise<CatalogProductsResult> {
  const search = new URLSearchParams();
  if (params.query) search.set("query", params.query);
  if (params.category) search.set("category", params.category);
  if (params.sort) search.set("sort", params.sort);
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return getJson<CatalogProductsResult>(`/catalog/products${qs ? `?${qs}` : ""}`);
}

export async function fetchCatalogCategories(): Promise<CatalogCategory[]> {
  return getJson<CatalogCategory[]>("/catalog/categories");
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  return getJson<PaymentMethod[]>("/payment-methods?currency=PEN");
}
```

- [ ] **Step 8: Correr ambos tests y verificar que pasan**

```bash
npm run test:unit -- catalog-client.test.ts format.test.ts
```

Esperado: los 7 tests (4 de `catalog-client` + 3 de `format`) en verde.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/catalog-client.ts frontend/src/lib/catalog-client.test.ts frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "Frontend: cliente fetch del catalogo real (catalog-client.ts) y formateo de precios"
```

---

## Task 4: `sort-select.tsx`

**Files:**
- Create: `frontend/src/components/sort-select.tsx`

**Interfaces:**
- Consumes: `CatalogSort` de `@/lib/catalog-client` (Task 3).
- Produces: `<SortSelect value?: CatalogSort />` — usado por `catalog-grid.tsx` en Task 10.

No hay infraestructura de test de componentes en este proyecto (no hay `@testing-library/react`; los componentes
de UI existentes como `guarantees.tsx`/`faq-section.tsx` tampoco tienen test dedicado — se verifican con
`npm run build` + QA manual en Task 11). Este task sigue el mismo patrón.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CatalogSort } from "@/lib/catalog-client";

const SORT_OPTIONS: { value: CatalogSort | ""; label: string }[] = [
  { value: "", label: "Más relevantes" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "newest", label: "Más recientes" },
];

export function SortSelect({ value }: { value?: CatalogSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (event.target.value) {
      params.set("sort", event.target.value);
    } else {
      params.delete("sort");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Ordenar
      <select
        value={value ?? ""}
        onChange={handleChange}
        className="h-10 rounded-[8px] border border-line bg-surface px-3 text-sm text-ink"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
```

Guardar en `frontend/src/components/sort-select.tsx`.

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores (el archivo no se usa todavía en ningún lado, así que no puede romper nada; esto solo
confirma que el propio archivo tipa bien).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/sort-select.tsx
git commit -m "Frontend: SortSelect, control de orden del catalogo"
```

---

## Task 5: `hero-search.tsx` — búsqueda real sin JS

**Files:**
- Modify: `frontend/src/components/hero-search.tsx`

**Interfaces:**
- Consumes: `CatalogSort` de `@/lib/catalog-client` (Task 3).
- Produces: `<HeroSearch defaultQuery?: string; category?: string; sort?: CatalogSort />` — usado por `hero.tsx`
  en Task 8. Ya no incluye el `<h1>`/subtítulo (se mueven a `hero.tsx`); el componente queda reducido al
  `<form>` de búsqueda.

- [ ] **Step 1: Reemplazar el contenido del archivo**

```tsx
import type { CatalogSort } from "@/lib/catalog-client";

export function HeroSearch({
  defaultQuery,
  category,
  sort,
}: {
  defaultQuery?: string;
  category?: string;
  sort?: CatalogSort;
}) {
  return (
    <form className="mt-8 flex max-w-xl items-center gap-2" role="search" action="/" method="GET">
      <label htmlFor="catalog-search" className="sr-only">
        Buscar herramienta
      </label>
      <input
        id="catalog-search"
        name="query"
        type="search"
        defaultValue={defaultQuery}
        placeholder="Busca una herramienta…"
        className="h-[52px] flex-1 rounded-[10px] border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-muted"
      />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {sort ? <input type="hidden" name="sort" value={sort} /> : null}
      <button
        type="submit"
        className="h-[52px] rounded-[10px] bg-accent px-6 text-base font-medium text-white hover:bg-accent-hover"
      >
        Buscar
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend
npm run build
```

Esperado: build exitoso. `app/page.tsx` (todavía sin tocar) sigue llamando `<HeroSearch />` sin props — como los
3 props nuevos son opcionales, sigue siendo válido (aunque visualmente la portada pierda el título grande hasta
el Task 10; eso es esperado en un estado intermedio, no es la verificación final).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/hero-search.tsx
git commit -m "Frontend: HeroSearch pasa a form GET real, preserva categoria/orden"
```

---

## Task 6: `trust-stats.tsx`

**Files:**
- Create: `frontend/src/components/trust-stats.tsx`

**Interfaces:**
- Produces: `<TrustStats totalProducts: number />` — usado por `app/page.tsx` en Task 10. Reemplaza a
  `guarantees.tsx` (que se borra en Task 10).

- [ ] **Step 1: Crear el componente**

```tsx
interface TrustStatsProps {
  totalProducts: number;
}

export function TrustStats({ totalProducts }: TrustStatsProps) {
  const stats = [
    { title: "Entrega rápida", body: 'Tu clave queda en "Mis pedidos" al aprobarse el pago.' },
    { title: "Reposición garantizada", body: "Si tu clave falla, la repones dentro de 7 días." },
    { title: "Soporte real", body: "Tickets de soporte y reclamos atendidos por el equipo." },
    { title: `${totalProducts} herramientas`, body: "Catálogo activo, con nuevas licencias cada semana." },
  ];

  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <li key={stat.title} className="rounded-2xl border border-line-soft bg-surface p-5">
            <p className="font-display text-base font-bold text-ink">{stat.title}</p>
            <p className="mt-1 text-sm text-muted">{stat.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Guardar en `frontend/src/components/trust-stats.tsx`.

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/trust-stats.tsx
git commit -m "Frontend: TrustStats, franja de confianza con dato real de catalogo"
```

---

## Task 7: `how-it-works.tsx`

**Files:**
- Create: `frontend/src/components/how-it-works.tsx`

**Interfaces:**
- Produces: `<HowItWorks />` (sin props) — usado por `app/page.tsx` en Task 10.

- [ ] **Step 1: Crear el componente**

```tsx
const STEPS = [
  { n: 1, title: "Elegí la herramienta", body: "Buscá o filtrá por categoría y elegí el plan que necesitás." },
  { n: 2, title: "Pagá con el método que prefieras", body: "Yape, Plin o transferencia — vos elegís." },
  { n: 3, title: "Subí tu comprobante", body: "Capturá o fotografiá el pago y súbelo al pedido." },
  { n: 4, title: "Recibí tu clave", body: 'Validamos el pago y tu clave queda lista en "Mis pedidos".' },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <h2 className="font-display text-2xl font-bold text-ink">¿Cómo comprar?</h2>
      <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n} className="rounded-2xl border border-line-soft bg-surface p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {step.n}
            </span>
            <p className="font-display mt-3 text-base font-bold text-ink">{step.title}</p>
            <p className="mt-1 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

Guardar en `frontend/src/components/how-it-works.tsx`.

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/how-it-works.tsx
git commit -m "Frontend: HowItWorks, 4 pasos reales de compra"
```

---

## Task 8: `hero.tsx` — hero de 2 columnas con tarjeta de vidrio

**Files:**
- Create: `frontend/src/components/hero.tsx`

**Interfaces:**
- Consumes: `HeroSearch` (Task 5), `PaymentMethod`/`CatalogSort` de `@/lib/catalog-client` (Task 3).
- Produces: `<Hero paymentMethods: PaymentMethod[]; query?: string; category?: string; sort?: CatalogSort />` —
  usado por `app/page.tsx` en Task 10.

- [ ] **Step 1: Crear el componente**

```tsx
import { HeroSearch } from "./hero-search";
import type { CatalogSort, PaymentMethod } from "@/lib/catalog-client";

export function Hero({
  paymentMethods,
  query,
  category,
  sort,
}: {
  paymentMethods: PaymentMethod[];
  query?: string;
  category?: string;
  sort?: CatalogSort;
}) {
  return (
    <section className="bg-surface">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <h1 className="font-display max-w-xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            Licencias para tus herramientas de servicio técnico
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Compra, paga por Yape/Plin o transferencia y recibe tu licencia en minutos.
          </p>
          <HeroSearch defaultQuery={query} category={category} sort={sort} />
        </div>

        <div className="rounded-[24px] border border-accent-soft-bg bg-surface/70 p-6 shadow-sm backdrop-blur-md">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-accent-press">
            Garantías Free Cell
          </p>
          <ul className="mt-4 space-y-3 text-sm text-ink">
            <li>Reposición de clave dentro de 7 días si falla.</li>
            <li>Soporte real por WhatsApp, no un bot.</li>
          </ul>
          {paymentMethods.length > 0 ? (
            <>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">Pagás con</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {paymentMethods.map((method) => (
                  <li
                    key={method.id}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink"
                  >
                    {method.name}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
```

Guardar en `frontend/src/components/hero.tsx`.

- [ ] **Step 2: Verificar que compila**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/hero.tsx
git commit -m "Frontend: Hero de 2 columnas con tarjeta de vidrio y metodos de pago reales"
```

---

## Task 9: `loading.tsx` + `error.tsx`

**Files:**
- Create: `frontend/src/app/loading.tsx`
- Create: `frontend/src/app/error.tsx`

**Interfaces:** Ninguna — son archivos de convención de Next.js (App Router), no se importan manualmente.

- [ ] **Step 1: Crear `loading.tsx`**

```tsx
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1200px] items-center justify-center px-6 py-24 text-muted">
      Cargando catálogo…
    </div>
  );
}
```

Guardar en `frontend/src/app/loading.tsx`.

- [ ] **Step 2: Crear `error.tsx`**

```tsx
"use client";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">Algo salió mal</h1>
      <p className="text-muted">No pudimos cargar la tienda. Intenta de nuevo.</p>
      <button
        type="button"
        onClick={reset}
        className="flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Reintentar
      </button>
    </div>
  );
}
```

Guardar en `frontend/src/app/error.tsx`. (`error` se recibe pero no se muestra al usuario — nunca exponer el
mensaje crudo de un error de servidor; se recibe con el nombre `_error` para que el linter no lo marque como
variable sin usar.)

- [ ] **Step 3: Verificar que compila**

```bash
cd frontend
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/loading.tsx frontend/src/app/error.tsx
git commit -m "Frontend: loading.tsx y error.tsx para la ruta del catalogo"
```

---

## Task 10: Integración — grid, card, página real, borrar el mock

Este es el task que efectivamente conecta todo. Los archivos de este task están acoplados entre sí (cambiar
`product-card.tsx` sin actualizar `catalog-grid.tsx`/`app/page.tsx` en el mismo paso rompería el build), así que
van juntos.

**Files:**
- Modify: `frontend/src/components/stock-badge.tsx`
- Modify: `frontend/src/components/product-card.tsx`
- Modify: `frontend/src/components/catalog-grid.tsx`
- Modify: `frontend/src/app/page.tsx`
- Delete: `frontend/src/lib/mock-catalog.ts`
- Delete: `frontend/src/components/guarantees.tsx`

**Interfaces:**
- Consumes: todo lo producido en Tasks 1–9 (`catalog-client.ts`, `format.ts`, `sort-select.tsx`, `hero.tsx`,
  `trust-stats.tsx`, `how-it-works.tsx`).

- [ ] **Step 1: Confirmar que nada más importa lo que se va a borrar**

```bash
cd frontend
grep -rn "mock-catalog" src/
grep -rn "components/guarantees" src/
```

Esperado: solo aparecen los propios archivos a borrar y los imports en `catalog-grid.tsx`/`product-card.tsx`/
`stock-badge.tsx`/`app/page.tsx` que este mismo task está por reemplazar. Si aparece algo más, detenerse y
revisar antes de seguir (puede ser un archivo de test u otra pantalla que todavía dependa del mock).

- [ ] **Step 2: Reescribir `stock-badge.tsx`**

```tsx
import type { StockState } from "@/lib/catalog-client";

const STOCK_LABEL: Record<StockState, string> = {
  IN_STOCK: "En stock",
  LOW: "Pocas unidades",
  OUT_OF_STOCK: "Agotado",
};

const STYLES: Record<StockState, string> = {
  IN_STOCK: "bg-success-bg text-success-ink",
  LOW: "bg-warning-bg text-warning-ink",
  OUT_OF_STOCK: "bg-danger-bg text-danger-ink",
};

export function StockBadge({ state }: { state: StockState }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[state]}`}>
      {STOCK_LABEL[state]}
    </span>
  );
}
```

- [ ] **Step 3: Reescribir `product-card.tsx`**

```tsx
import type { CatalogProductListItem } from "@/lib/catalog-client";
import { formatPriceCents } from "@/lib/format";
import { StockBadge } from "./stock-badge";

export function ProductCard({ product }: { product: CatalogProductListItem }) {
  return (
    <article className="flex flex-col rounded-2xl border border-line-soft bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted">{product.categoryName ?? "Sin categoría"}</p>
          <h3 className="font-display mt-0.5 text-lg font-bold text-ink">{product.name}</h3>
        </div>
        <StockBadge state={product.stockState} />
      </div>

      <p className="mt-4 text-sm text-muted">
        Desde{" "}
        <span className="font-medium text-ink">
          {formatPriceCents(product.priceFromCents, product.currency)}
        </span>
      </p>
    </article>
  );
}
```

- [ ] **Step 4: Reescribir `catalog-grid.tsx`**

```tsx
import Link from "next/link";
import type { CatalogCategory, CatalogProductListItem, CatalogSort } from "@/lib/catalog-client";
import { ProductCard } from "./product-card";
import { SortSelect } from "./sort-select";

function buildCategoryHref(
  categoryId: string | undefined,
  current: { query?: string; sort?: CatalogSort },
): string {
  const params = new URLSearchParams();
  if (current.query) params.set("query", current.query);
  if (current.sort) params.set("sort", current.sort);
  if (categoryId) params.set("category", categoryId);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function CatalogGrid({
  products,
  categories,
  total,
  selectedCategory,
  selectedSort,
  selectedQuery,
}: {
  products: CatalogProductListItem[];
  categories: CatalogCategory[];
  total: number;
  selectedCategory?: string;
  selectedSort?: CatalogSort;
  selectedQuery?: string;
}) {
  const current = { query: selectedQuery, sort: selectedSort };

  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold text-ink">Catálogo</h2>
        <SortSelect value={selectedSort} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
        <Link
          href={buildCategoryHref(undefined, current)}
          aria-pressed={!selectedCategory}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            !selectedCategory ? "border-accent bg-accent-soft-bg text-accent-soft-ink" : "border-line-strong text-muted"
          }`}
        >
          Todas
        </Link>
        {categories.map((cat) => {
          const active = cat.id === selectedCategory;
          return (
            <Link
              key={cat.id}
              href={buildCategoryHref(cat.id, current)}
              aria-pressed={active}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                active ? "border-accent bg-accent-soft-bg text-accent-soft-ink" : "border-line-strong text-muted"
              }`}
            >
              {cat.name}
            </Link>
          );
        })}
      </div>

      {products.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Sin resultados para este filtro por ahora.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">{total} herramientas disponibles</p>
          <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Reescribir `app/page.tsx`**

```tsx
import { CatalogGrid } from "@/components/catalog-grid";
import { FaqSection } from "@/components/faq-section";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TrustStats } from "@/components/trust-stats";
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  fetchPaymentMethods,
  type CatalogSort,
} from "@/lib/catalog-client";

const VALID_SORTS: CatalogSort[] = ["price_asc", "price_desc", "newest"];

function parseSort(value: string | undefined): CatalogSort | undefined {
  return VALID_SORTS.includes(value as CatalogSort) ? (value as CatalogSort) : undefined;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; category?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);

  try {
    const [categories, productsResult, paymentMethods] = await Promise.all([
      fetchCatalogCategories(),
      fetchCatalogProducts({ query: params.query, category: params.category, sort, pageSize: 50 }),
      fetchPaymentMethods(),
    ]);

    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <Hero paymentMethods={paymentMethods} query={params.query} category={params.category} sort={sort} />
          <TrustStats totalProducts={productsResult.total} />
          <CatalogGrid
            products={productsResult.items}
            categories={categories}
            total={productsResult.total}
            selectedCategory={params.category}
            selectedSort={sort}
            selectedQuery={params.query}
          />
          <HowItWorks />
          <FaqSection />
        </main>
        <SiteFooter />
      </>
    );
  } catch {
    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <section className="mx-auto max-w-[1200px] px-6 py-24 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">No pudimos cargar la tienda</h1>
            <p className="mt-2 text-muted">Intenta de nuevo en un momento.</p>
          </section>
        </main>
        <SiteFooter />
      </>
    );
  }
}
```

- [ ] **Step 6: Borrar los archivos superados**

```bash
rm frontend/src/lib/mock-catalog.ts
rm frontend/src/components/guarantees.tsx
```

- [ ] **Step 7: Verificar que el build pasa**

```bash
cd frontend
npm run build
```

Esperado: build exitoso, sin referencias colgantes a `mock-catalog` ni `guarantees`.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "Frontend: catalogo conectado a la API real, borra mock-catalog.ts y guarantees.tsx"
```

---

## Task 11: Docs + QA manual

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md`
- Modify: `docs/07-diseno-ui.md`
- Modify: `docs/10-orden-de-ejecucion.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: `docs/02-requerimientos-funcionales.md`**

Cambiar la fila de `RF-CAT-08`:

```
| RF-CAT-08 | "Más vendidos" y "Recién llegados" en la portada. | S | ⬜ |
```

por:

```
| RF-CAT-08 | "Más vendidos" y "Recién llegados" en la portada. | S | 🟡 ("Recién llegados" vía `?sort=newest` ✅; "Más vendidos" falta — necesita datos de ventas agregados) |
```

- [ ] **Step 2: `docs/07-diseno-ui.md`**

En la tabla de Tokens, cambiar la fila de `accent`:

```
| `accent` | `#0A58E0` (variable editable) | Botón primario, enlaces, selección |
```

por:

```
| `accent` | `#6D28D9` / hover `#7C3AED` / press `#5B21B6` (variable editable) | Botón primario, enlaces, selección |
```

- [ ] **Step 3: `docs/10-orden-de-ejecucion.md`**

Marcar el paso 2 como hecho (mismo patrón usado para el paso 1): agregar `✅` y la fecha al texto de la fila 2
de la tabla, y actualizar la sección "Estado" al final del archivo para decir que el paso 2 está completo y que
el siguiente es el paso 3 (producto/carrito/checkout).

- [ ] **Step 4: `CLAUDE.md`**

Buscar la línea (sección "Frontend"):

```
- No inventar datos de negocio: seguir el patrón de `src/lib/mock-catalog.ts` (placeholders `[..]`) hasta conectar la API.
```

y reemplazarla por:

```
- No inventar datos de negocio: usar placeholders `[..]` solo donde la API todavía no provee el dato real.
- Catálogo (S1) conectado a `GET /catalog/products`, `/catalog/categories`, `/payment-methods` reales — ✅
  implementado (Sprint 2). No hay más `mock-catalog.ts`.
```

Y en la sección "Estado" del encabezado, en la línea que describe el estado de `frontend/`, quitar "pantalla S1
(Catálogo) construida con datos de ejemplo (sin conectar a la API todavía)" y reemplazar por "pantalla S1
(Catálogo) conectada a la API real (Sprint 2)".

- [ ] **Step 5: Commit de docs**

```bash
git add docs/02-requerimientos-funcionales.md docs/07-diseno-ui.md docs/10-orden-de-ejecucion.md CLAUDE.md
git commit -m "Docs: catalogo del frontend conectado a la API real (paso 2 completo)"
```

- [ ] **Step 6: QA manual en navegador**

Con el backend corriendo (`cd backend && docker compose up -d && npm run start:dev`, seed cargado con
`npm run seed` si hace falta catálogo de prueba) y el frontend en modo dev:

```bash
cd frontend
npm run dev -- --port 3001
```

Abrir `http://localhost:3001` y verificar:
- El catálogo real carga (no hay productos "[Producto 1]" de ejemplo).
- Filtrar por categoría (click en un chip) cambia la URL a `?category=<id>` y la lista.
- Buscar un término en el buscador del hero filtra por `?query=`.
- Cambiar el selector "Ordenar" cambia el orden y la URL a `?sort=`.
- Las 3 cosas combinadas (categoría + búsqueda + orden) no se pisan entre sí.
- Un filtro sin resultados muestra el estado vacío, no un error.
- La tarjeta de vidrio del hero muestra los métodos de pago reales configurados en el backend.
- No aparece ningún número o porcentaje inventado en ninguna parte de la pantalla.
- Probar también con el backend apagado: debe mostrarse el fallback "No pudimos cargar la tienda", no una
  pantalla en blanco ni un stack trace.

Parar el servidor de dev al terminar.

---

## Self-review (hecho por quien escribió el plan)

- **Cobertura del spec:** tokens (Task 2) ✅, `sort` backend (Task 1) ✅, fetch layer (Task 3) ✅, todos los
  componentes listados en la tabla del spec (Tasks 4–10) ✅, docs a actualizar (Task 11) ✅, fuera de alcance
  (`/p/[slug]`, "más populares", las 12 pantallas de Stitch) respetado — ningún task las toca.
- **Placeholders:** ninguno — cada step de código trae el archivo completo o el fragmento exacto a pegar.
- **Consistencia de tipos:** `CatalogSort`, `StockState`, `CatalogProductListItem`, `PaymentMethod` se definen
  una sola vez en Task 3 y se importan igual (mismo nombre, mismo shape) en Tasks 4, 5, 6, 8, 10 — verificado
  cruzando cada `import type` contra la interfaz "Produces" de Task 3.
