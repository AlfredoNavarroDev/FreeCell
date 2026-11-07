# Panel admin de pagos (S6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al admin una pantalla real en `/admin/pagos` para revisar la cola de pagos pendientes y aprobar/rechazar en ≤2 clics, con avance automático al siguiente pago, sin recargar la página.

**Architecture:** Backend extiende `AdminPaymentResponseDto` (ya completo en approve/reject) con los campos de solo-lectura que faltaban para que la UI no tenga que resolverlos aparte: nombre/correo del cliente, nombre de producto/plan y método de pago, y stock disponible por ítem. Frontend: un shell `/admin` nuevo (sidebar) + una página maestro-detalle 100% client-side para la interacción (selección, rechazo con motivo, refetch tras cada acción), alimentada por Server Actions que siguen el mismo patrón ya usado en `orders-client.ts`.

**Tech Stack:** NestJS + TypeORM + Postgres (backend, sin migración — son queries nuevas sobre tablas existentes); Next.js 16 App Router + TypeScript + Tailwind v4, Server Actions, Vitest, Playwright (frontend).

**Spec:** `docs/superpowers/specs/2026-11-07-admin-pagos-design.md`

## Global Constraints

- D18: tras rechazar, el pedido vuelve a `PENDING_PAYMENT` con plazo extra (máx. 2 reintentos); al 3.º se cancela y libera la licencia. Ya implementado en `fn_reject_payment` — este plan no lo toca.
- D29 (el catálogo de cliente nunca muestra cantidad exacta de stock) **no aplica** a este panel: es interno, y el stock exacto es justamente lo que pide RF-ADM-11.
- Refetch completo de `GET /admin/payments?status=PENDING` tras cada aprobar/rechazar — nunca mutar la lista en memoria a mano.
- El shell de `/admin` se construye completo ahora (sidebar con las 4 secciones); Inventario y Reclamos quedan como placeholders de una línea — no se implementan en este plan.
- `availableStock` es solo el conteo puntual por ítem que pide RF-ADM-11, no el módulo de Inventario (S7, `GET /admin/inventory`, fuera de alcance).
- El contador "Reserva: MM:SS" (`<Countdown>`) es informativo — no bloquea ni gatea ninguna acción del admin.
- Accesibilidad AA del proyecto: objetivos ≥44px, el color nunca es el único indicador.
- Entidades/rutas/código en inglés; mensajes al usuario y documentación en español.
- Dinero en céntimos enteros (`totalCents`); moneda `PEN`/`USD`.

---

### Task 1: Backend — extender `AdminPaymentResponseDto` con nombre de cliente/método/producto/plan y stock disponible

**Files:**
- Modify: `backend/src/orders/dto/admin-payment-response.dto.ts`
- Modify: `backend/src/orders/admin-payments.service.ts`
- Test: `backend/test/admin-payments.e2e-spec.ts`

**Interfaces:**
- Consumes: nada nuevo — mismas tablas (`payments`, `orders`, `users`, `order_items`, `plans`, `products`, `payment_methods`, `license_items`) ya usadas por `list()`.
- Produces: `AdminPaymentResponseDto` ahora incluye `customerName: string | null`, `customerEmail: string`, `paymentMethodName: string`. `AdminPaymentItemDto` ahora incluye `productName: string`, `planName: string`, `availableStock: number`. El resto de campos (incluidos `approve`/`reject`, que devuelven `OrderResponseDto`, no este DTO) no cambia.

- [ ] **Step 1: Escribir el test que falla**

Abrir `backend/test/admin-payments.e2e-spec.ts` y agregar este `it` dentro de `describe('GET /admin/payments', ...)`, después del test existente `'lista pendientes ordenados por antigüedad...'`:

```ts
    it('incluye nombre/correo del cliente, nombre del método, de producto/plan y stock disponible por ítem', async () => {
      const admin = await createUser(ds, { role: Role.ADMIN });
      const customer = await createUser(ds, { name: 'Cliente Demo' });
      const method = await createPaymentMethod(ds, {
        name: 'Yape',
        currencies: ['PEN'],
      });
      const catalog = await createCatalog(ds, {
        stock: 3,
        prices: { PEN: 1000 },
      });

      const { orderId } = await insertOrder(ds, {
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
      await insertPayment(ds, { orderId, paymentMethodId: method.id });

      const res = await request(app.getHttpServer())
        .get('/admin/payments?status=PENDING')
        .set('Authorization', `Bearer ${tokenFor(admin)}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        items: {
          orderId: string;
          customerName: string | null;
          customerEmail: string;
          paymentMethodName: string;
          items: {
            planId: string;
            unitPriceCents: number;
            productName: string;
            planName: string;
            availableStock: number;
          }[];
        }[];
      };
      const row = body.items.find((i) => i.orderId === orderId)!;
      expect(row.customerName).toBe('Cliente Demo');
      expect(row.customerEmail).toBe(customer.email);
      expect(row.paymentMethodName).toBe('Yape');
      expect(row.items).toEqual([
        {
          planId: catalog.plan.id,
          unitPriceCents: 1000,
          productName: catalog.product.name,
          planName: catalog.plan.name,
          availableStock: 2,
        },
      ]);
    });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npm run test:e2e -- admin-payments`
Expected: FAIL — `customerName`/`paymentMethodName`/`productName`/`planName`/`availableStock` son `undefined` en la respuesta (el DTO actual no los trae).

- [ ] **Step 3: Implementar**

Reemplazar el contenido completo de `backend/src/orders/dto/admin-payment-response.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES, type Currency } from '../../database/currency';
import { PaymentStatus } from '../../database/enums';

export class AdminPaymentItemDto {
  @ApiProperty() planId!: string;
  @ApiProperty() unitPriceCents!: number;
  @ApiProperty() productName!: string;
  @ApiProperty() planName!: string;
  @ApiProperty() availableStock!: number;
}

interface AdminPaymentRow {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  status: PaymentStatus;
  paymentMethodId: string;
  paymentMethodName: string;
  operationNumber: string;
  totalCents: number;
  currency: Currency;
  expiresAt: Date;
  toolUsername: string | null;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string;
}

/** Fila de la cola de pagos (S6): lo que el admin necesita para decidir sin abrir otra pantalla. */
export class AdminPaymentResponseDto {
  @ApiProperty() paymentId!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() orderNumber!: number;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty() paymentMethodId!: string;
  @ApiProperty() paymentMethodName!: string;
  @ApiProperty() operationNumber!: string;
  @ApiProperty() proofUrl!: string;
  @ApiProperty() totalCents!: number;
  @ApiProperty({ enum: CURRENCIES }) currency!: Currency;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ type: String, nullable: true }) toolUsername!: string | null;
  @ApiProperty({ type: [AdminPaymentItemDto] }) items!: AdminPaymentItemDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty() customerEmail!: string;

  static from(
    row: AdminPaymentRow,
    items: AdminPaymentItemDto[],
    proofUrl: string,
  ): AdminPaymentResponseDto {
    return {
      paymentId: row.paymentId,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      status: row.status,
      paymentMethodId: row.paymentMethodId,
      paymentMethodName: row.paymentMethodName,
      operationNumber: row.operationNumber,
      proofUrl,
      totalCents: row.totalCents,
      currency: row.currency,
      expiresAt: row.expiresAt,
      toolUsername: row.toolUsername,
      items,
      createdAt: row.createdAt,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
    };
  }
}
```

En `backend/src/orders/admin-payments.service.ts`, reemplazar la interfaz `AdminPaymentRow` y el método `list()` completo:

```ts
interface AdminPaymentRow {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  status: PaymentStatus;
  paymentMethodId: string;
  paymentMethodName: string;
  operationNumber: string;
  proofKey: string;
  totalCents: number;
  currency: Currency;
  expiresAt: Date;
  toolUsername: string | null;
  createdAt: Date;
  customerName: string | null;
  customerEmail: string;
}
```

```ts
  async list(
    dto: ListAdminPaymentsQueryDto,
  ): Promise<PaginatedResponseDto<AdminPaymentResponseDto>> {
    const offset = (dto.page - 1) * dto.pageSize;
    const rows: AdminPaymentRow[] = await this.ds.query(
      `SELECT p.id AS "paymentId", p."orderId", o."orderNumber", p.status,
              p."paymentMethodId", pm.name AS "paymentMethodName",
              p."operationNumber", p."proofKey",
              o."totalCents", o.currency, o."expiresAt", o."toolUsername", p."createdAt",
              u.name AS "customerName", u.email AS "customerEmail"
         FROM payments p
         JOIN orders o ON o.id = p."orderId"
         JOIN users u ON u.id = o."userId"
         JOIN payment_methods pm ON pm.id = p."paymentMethodId"
        WHERE ($1::text IS NULL OR p.status::text = $1)
        ORDER BY p."createdAt" ASC
        LIMIT $2 OFFSET $3`,
      [dto.status ?? null, dto.pageSize, offset],
    );
    const [{ count }]: { count: string }[] = await this.ds.query(
      `SELECT count(*) FROM payments WHERE ($1::text IS NULL OR status::text = $1)`,
      [dto.status ?? null],
    );

    const orderIds = rows.map((row) => row.orderId);
    const items: {
      orderId: string;
      planId: string;
      unitPriceCents: number;
      productName: string;
      planName: string;
    }[] = orderIds.length
      ? await this.ds.query(
          `SELECT oi."orderId", oi."planId", oi."unitPriceCents",
                  pl.name AS "planName", pr.name AS "productName"
             FROM order_items oi
             JOIN plans pl ON pl.id = oi."planId"
             JOIN products pr ON pr.id = pl."productId"
            WHERE oi."orderId" = ANY($1::uuid[])`,
          [orderIds],
        )
      : [];

    const planIds = [...new Set(items.map((item) => item.planId))];
    const stockRows: { planId: string; availableStock: string }[] =
      planIds.length
        ? await this.ds.query(
            `SELECT "planId", count(*) AS "availableStock"
               FROM license_items
              WHERE status = 'AVAILABLE' AND "planId" = ANY($1::uuid[])
              GROUP BY "planId"`,
            [planIds],
          )
        : [];
    const stockByPlan = new Map(
      stockRows.map((row) => [row.planId, Number(row.availableStock)]),
    );

    const itemsByOrder = new Map<string, AdminPaymentItemDto[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push({
        planId: item.planId,
        unitPriceCents: item.unitPriceCents,
        productName: item.productName,
        planName: item.planName,
        availableStock: stockByPlan.get(item.planId) ?? 0,
      });
      itemsByOrder.set(item.orderId, list);
    }

    const dtos = await Promise.all(
      rows.map(async (row) =>
        AdminPaymentResponseDto.from(
          row,
          itemsByOrder.get(row.orderId) ?? [],
          await this.storage.createProofDownloadUrl(row.proofKey),
        ),
      ),
    );
    return PaginatedResponseDto.from(
      dtos,
      Number(count),
      dto.page,
      dto.pageSize,
    );
  }
```

No se toca nada más de la clase (`approve`, `reject`, los métodos privados siguen igual).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npm run test:e2e -- admin-payments`
Expected: PASS (todos los tests del archivo, incluido el nuevo).

- [ ] **Step 5: Commit**

```bash
git add backend/src/orders/dto/admin-payment-response.dto.ts backend/src/orders/admin-payments.service.ts backend/test/admin-payments.e2e-spec.ts
git commit -m "Backend: admin-payments incluye nombre de cliente/metodo/producto/plan y stock disponible"
```

---

### Task 2: `admin-payments-client.ts` — Server Actions del panel de pagos

**Files:**
- Create: `frontend/src/lib/admin-payments-client.ts`
- Test: `frontend/src/lib/admin-payments-client.test.ts`

**Interfaces:**
- Consumes: `OrderView` de `@/lib/orders-client` (ya existe — `approve`/`reject` del backend devuelven ese mismo DTO de pedido).
- Produces: `AdminPaymentStatus`, `PaymentRejectionReason`, `AdminPaymentItemView`, `AdminPaymentView`, `AdminPaymentsPage`, `AdminPaymentsActionResult<T>`, `fetchAdminPayments(status?, pageSize?)`, `approvePayment(paymentId)`, `rejectPayment(paymentId, reason)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/admin-payments-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("fetchAdminPayments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("pide la cola con status y pageSize en la query, con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminPayments } = await import("./admin-payments-client");
    const result = await fetchAdminPayments("PENDING", 50);

    expect(result).toEqual({ ok: true, data: page });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments?status=PENDING&pageSize=50");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-admin" });
  });

  it("usa status=PENDING y pageSize=50 por defecto", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const page = { items: [], total: 0, page: 1, pageSize: 50 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminPayments } = await import("./admin-payments-client");
    await fetchAdminPayments();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments?status=PENDING&pageSize=50");
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAdminPayments } = await import("./admin-payments-client");
    const result = await fetchAdminPayments();

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("approvePayment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/payments/:id/approve con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const order = {
      id: "order-1",
      orderNumber: 1,
      status: "DELIVERED",
      totalCents: 1000,
      currency: "PEN",
      expiresAt: "2026-11-07T00:00:00.000Z",
      cancelReason: null,
      items: [{ planId: "plan-1", unitPriceCents: 1000 }],
      paymentStatus: "APPROVED",
      paymentRejectionReason: null,
      tracking: { createdAt: "2026-11-07T00:00:00.000Z", paymentApprovedAt: "2026-11-07T00:01:00.000Z", deliveredAt: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(order), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { approvePayment } = await import("./admin-payments-client");
    const result = await approvePayment("payment-1");

    expect(result).toEqual({ ok: true, data: order });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments/payment-1/approve");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-admin" });
  });

  it("devuelve ok:false con el mensaje del backend si falla (ej. 409 ya revisado)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: "El pago ya fue revisado", error: "Conflict" }), {
        status: 409,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { approvePayment } = await import("./admin-payments-client");
    const result = await approvePayment("payment-1");

    expect(result).toEqual({ ok: false, status: 409, message: "El pago ya fue revisado" });
  });
});

describe("rejectPayment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("hace POST a /admin/payments/:id/reject con el motivo en el body", async () => {
    authMock.mockResolvedValue({ accessToken: "token-admin" });
    const order = {
      id: "order-1",
      orderNumber: 1,
      status: "PENDING_PAYMENT",
      totalCents: 1000,
      currency: "PEN",
      expiresAt: "2026-11-07T00:30:00.000Z",
      cancelReason: null,
      items: [{ planId: "plan-1", unitPriceCents: 1000 }],
      paymentStatus: "REJECTED",
      paymentRejectionReason: "Comprobante ilegible",
      tracking: { createdAt: "2026-11-07T00:00:00.000Z", paymentApprovedAt: null, deliveredAt: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(order), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { rejectPayment } = await import("./admin-payments-client");
    const result = await rejectPayment("payment-1", "ILLEGIBLE_PROOF");

    expect(result).toEqual({ ok: true, data: order });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/payments/payment-1/reject");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ reason: "ILLEGIBLE_PROOF" });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run src/lib/admin-payments-client.test.ts`
Expected: FAIL — `Cannot find module './admin-payments-client'`.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/admin-payments-client.ts`:

```ts
"use server";

import { auth } from "@/auth";
import type { OrderView } from "./orders-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type AdminPaymentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PaymentRejectionReason = "AMOUNT_MISMATCH" | "ILLEGIBLE_PROOF" | "OPERATION_NOT_FOUND";

export interface AdminPaymentItemView {
  planId: string;
  unitPriceCents: number;
  productName: string;
  planName: string;
  availableStock: number;
}

export interface AdminPaymentView {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  status: AdminPaymentStatus;
  paymentMethodId: string;
  paymentMethodName: string;
  operationNumber: string;
  proofUrl: string;
  totalCents: number;
  currency: "PEN" | "USD";
  expiresAt: string;
  toolUsername: string | null;
  items: AdminPaymentItemView[];
  createdAt: string;
  customerName: string | null;
  customerEmail: string;
}

export interface AdminPaymentsPage {
  items: AdminPaymentView[];
  total: number;
  page: number;
  pageSize: number;
}

export type AdminPaymentsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<AdminPaymentsActionResult<T>> {
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

  const data = (await res.json()) as T;
  return { ok: true, data };
}

export async function fetchAdminPayments(
  status: AdminPaymentStatus = "PENDING",
  pageSize = 50,
): Promise<AdminPaymentsActionResult<AdminPaymentsPage>> {
  return callBackend<AdminPaymentsPage>(`/admin/payments?status=${status}&pageSize=${pageSize}`, {
    method: "GET",
  });
}

export async function approvePayment(paymentId: string): Promise<AdminPaymentsActionResult<OrderView>> {
  return callBackend<OrderView>(`/admin/payments/${paymentId}/approve`, { method: "POST" });
}

export async function rejectPayment(
  paymentId: string,
  reason: PaymentRejectionReason,
): Promise<AdminPaymentsActionResult<OrderView>> {
  return callBackend<OrderView>(`/admin/payments/${paymentId}/reject`, {
    method: "POST",
    body: { reason },
  });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npx vitest run src/lib/admin-payments-client.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/admin-payments-client.ts frontend/src/lib/admin-payments-client.test.ts
git commit -m "Frontend: admin-payments-client (Server Actions de la cola de pagos)"
```

---

### Task 3: Shell de `/admin` — sidebar + placeholders de Inventario/Reclamos

**Files:**
- Create: `frontend/src/components/admin-sidebar.tsx`
- Create: `frontend/src/app/admin/layout.tsx`
- Create: `frontend/src/app/admin/inventario/page.tsx`
- Create: `frontend/src/app/admin/reclamos/page.tsx`

**Interfaces:**
- Consumes: `fetchAdminPayments` de `@/lib/admin-payments-client` (Task 2), `auth` de `@/auth`.
- Produces: `<AdminSidebar pendingPaymentsCount={number} adminName={string|null} />`; el layout envuelve toda ruta `/admin/*`.

- [ ] **Step 1: Implementar `admin-sidebar.tsx`**

Crear `frontend/src/components/admin-sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Inicio", badge: false },
  { href: "/admin/pagos", label: "Pagos", badge: true },
  { href: "/admin/inventario", label: "Inventario", badge: false },
  { href: "/admin/reclamos", label: "Reclamos", badge: false },
] as const;

export function AdminSidebar({
  pendingPaymentsCount,
  adminName,
}: {
  pendingPaymentsCount: number;
  adminName: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full max-w-[260px] flex-col gap-1 border-r border-line bg-surface p-4">
      <div className="px-2 pb-5 font-display text-lg font-bold tracking-tight text-ink">Free Cell</div>
      <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted">ADMIN</div>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "true" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium ${
              active ? "bg-accent-soft-bg text-accent-soft-ink" : "text-ink"
            }`}
          >
            {item.label}
            {item.badge && pendingPaymentsCount > 0 ? (
              <span className="ml-auto rounded-full bg-danger-bg px-2 text-xs font-semibold text-danger-ink">
                {pendingPaymentsCount}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col gap-1 border-t border-line-soft pt-4">
        <Link href="/" className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-ink">
          Ver tienda
        </Link>
        <p className="px-3 text-sm text-muted">{adminName ?? "Admin"}</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Implementar el layout de `/admin`**

Crear `frontend/src/app/admin/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import { fetchAdminPayments } from "@/lib/admin-payments-client";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [session, pendingResult] = await Promise.all([auth(), fetchAdminPayments("PENDING", 1)]);
  const pendingPaymentsCount = pendingResult.ok ? pendingResult.data.total : 0;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar pendingPaymentsCount={pendingPaymentsCount} adminName={session?.user.name ?? null} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Placeholders de Inventario y Reclamos**

Crear `frontend/src/app/admin/inventario/page.tsx`:

```tsx
export default function AdminInventarioPage() {
  return <p className="text-muted">Inventario — pantalla real en el paso 5 del roadmap (S7).</p>;
}
```

Crear `frontend/src/app/admin/reclamos/page.tsx`:

```tsx
export default function AdminReclamosPage() {
  return <p className="text-muted">Reclamos — pantalla real en S8.</p>;
}
```

- [ ] **Step 4: Verificar que el proyecto compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos. Si aparece un error de tipo de ruta (`AppRoutes`), correr antes `npx next typegen` y repetir.

- [ ] **Step 5: Probar manualmente**

Con el backend (`npm run start:dev`) y el frontend (`npm run dev -- --port 3001`) corriendo, iniciar sesión con `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `backend/.env` y visitar `/admin`. Verificar: el sidebar muestra Inicio/Pagos/Inventario/Reclamos + "Ver tienda" + el nombre del admin; "Inicio" está resaltado (`aria-current`); el badge de "Pagos" muestra el número de pagos `PENDING` reales (o no aparece si es 0); click en "Inventario"/"Reclamos" navega al placeholder; click en "Pagos" da 404 (esperado — es la Task 4).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin-sidebar.tsx frontend/src/app/admin/layout.tsx frontend/src/app/admin/inventario/page.tsx frontend/src/app/admin/reclamos/page.tsx
git commit -m "Frontend: shell de /admin (sidebar) y placeholders de Inventario/Reclamos"
```

---

### Task 4: `/admin/pagos` — cola, detalle, aprobar/rechazar con avance automático

**Files:**
- Create: `frontend/src/components/admin-payment-detail.tsx`
- Create: `frontend/src/components/admin-payments-queue.tsx`
- Create: `frontend/src/app/admin/pagos/page.tsx`

**Interfaces:**
- Consumes: `AdminPaymentView`, `PaymentRejectionReason`, `approvePayment`, `rejectPayment`, `fetchAdminPayments` de `@/lib/admin-payments-client` (Task 2); `Countdown` de `@/components/countdown` (ya existe); `formatPriceCents` de `@/lib/format` (ya existe).
- Produces: ruta `/admin/pagos`.

- [ ] **Step 1: Implementar `admin-payment-detail.tsx`**

Crear `frontend/src/components/admin-payment-detail.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Countdown } from "@/components/countdown";
import { formatPriceCents } from "@/lib/format";
import type { AdminPaymentView, PaymentRejectionReason } from "@/lib/admin-payments-client";

const REASONS: { value: PaymentRejectionReason; label: string }[] = [
  { value: "AMOUNT_MISMATCH", label: "Monto incorrecto" },
  { value: "ILLEGIBLE_PROOF", label: "Comprobante ilegible" },
  { value: "OPERATION_NOT_FOUND", label: "Operación no encontrada" },
];

export function AdminPaymentDetail({
  payment,
  rejecting,
  reason,
  submitting,
  onApprove,
  onStartReject,
  onCancelReject,
  onPickReason,
  onConfirmReject,
}: {
  payment: AdminPaymentView;
  rejecting: boolean;
  reason: PaymentRejectionReason | null;
  submitting: boolean;
  onApprove: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onPickReason: (reason: PaymentRejectionReason) => void;
  onConfirmReject: () => void;
}) {
  const [checks, setChecks] = useState({ amount: false, date: false, operation: false });
  const isPdf = payment.proofUrl.split("?")[0].toLowerCase().endsWith(".pdf");

  return (
    <section aria-label="Detalle del pago" className="flex-1 rounded-2xl border border-line-soft bg-surface p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl font-bold text-ink">{payment.customerName ?? payment.customerEmail}</p>
          <p className="text-sm text-muted">
            Pedido #{payment.orderNumber} · {payment.customerEmail}
          </p>
        </div>
        <div className="rounded-[10px] bg-warning-bg px-3 py-1 text-sm font-medium text-warning-ink">
          <Countdown expiresAt={payment.expiresAt} />
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="min-h-[280px] flex-1 basis-[220px]">
          {isPdf ? (
            <a
              href={payment.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-bg text-center text-sm font-medium text-accent"
            >
              Ver comprobante (PDF)
            </a>
          ) : (
            <div className="flex flex-col gap-2">
              <img
                src={payment.proofUrl}
                alt="Comprobante de pago"
                className="max-h-[280px] w-full rounded-xl border border-line-strong object-contain"
              />
              <a
                href={payment.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center text-sm font-medium text-accent"
              >
                Ampliar imagen
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-1 basis-[260px] flex-col gap-4">
          <div className="flex flex-col gap-3">
            {payment.items.map((item) => (
              <div key={item.planId} className="rounded-[10px] bg-success-bg px-3 py-2">
                <p className="font-medium text-ink">
                  {item.productName} · {item.planName}
                </p>
                <p className="text-sm text-success-ink">Stock para entregar: quedan {item.availableStock} licencias</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm text-muted">Monto que debe aparecer</p>
            <p className="font-display text-2xl font-bold text-ink">
              {formatPriceCents(payment.totalCents, payment.currency)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Método</p>
            <p className="font-medium text-ink">{payment.paymentMethodName}</p>
          </div>
          <div>
            <p className="text-sm text-muted">N.º de operación</p>
            <p className="font-medium text-ink">{payment.operationNumber}</p>
          </div>
          <fieldset className="flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 font-medium text-ink">Verifica antes de aprobar</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={checks.amount}
                onChange={(e) => setChecks((c) => ({ ...c, amount: e.target.checked }))}
                className="h-5 w-5"
              />
              El monto coincide
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={checks.date}
                onChange={(e) => setChecks((c) => ({ ...c, date: e.target.checked }))}
                className="h-5 w-5"
              />
              La fecha es la de hoy
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={checks.operation}
                onChange={(e) => setChecks((c) => ({ ...c, operation: e.target.checked }))}
                className="h-5 w-5"
              />
              La operación no se repite
            </label>
          </fieldset>
        </div>
      </div>

      {rejecting ? (
        <div className="mt-6 border-t border-line-soft pt-5">
          <p className="mb-3 font-medium text-ink">Motivo del rechazo (se lo mostramos al cliente)</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={reason === r.value}
                onClick={() => onPickReason(r.value)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                  reason === r.value ? "border-danger-ink bg-danger-bg text-danger-ink" : "border-line-strong text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirmReject}
              disabled={!reason || submitting}
              className="flex h-12 items-center justify-center rounded-[10px] bg-danger-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={onCancelReject}
              disabled={submitting}
              className="flex h-12 items-center justify-center rounded-[10px] border border-line-strong px-6 text-sm font-semibold text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 border-t border-line-soft pt-5">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onApprove}
              disabled={submitting}
              className="flex h-12 flex-1 items-center justify-center rounded-[10px] bg-success-ink px-6 text-base font-semibold text-white disabled:opacity-50"
            >
              Aprobar y entregar licencia
            </button>
            <button
              type="button"
              onClick={onStartReject}
              disabled={submitting}
              className="flex h-12 items-center justify-center rounded-[10px] border border-danger-ink px-6 text-base font-semibold text-danger-ink disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            Al aprobar, se asigna una licencia disponible, se envía por correo y pasas al siguiente pago.
          </p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Implementar `admin-payments-queue.tsx`**

> **Nota (corregido durante la verificación manual, previa al Task 5):** el `return` temprano para
> `payments.length === 0` dejaba afuera el bloque que muestra `message`/`error` — probado en vivo: tras
> rechazar o aprobar el único pago pendiente, la cola queda vacía y el banner de éxito/error nunca se
> pintaba (el Task 5 espera verlo con `page.getByText(/aprobado|rechazado/)`). El bloque abajo ya tiene la
> corrección: `message`/`error` se renderizan primero, y el estado vacío vs. la cola+detalle son ramas
> mutuamente excluyentes del mismo `return`, sin cambiar ninguna otra lógica.

Crear `frontend/src/components/admin-payments-queue.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AdminPaymentDetail } from "@/components/admin-payment-detail";
import {
  approvePayment,
  fetchAdminPayments,
  rejectPayment,
  type AdminPaymentView,
  type PaymentRejectionReason,
} from "@/lib/admin-payments-client";
import { formatPriceCents } from "@/lib/format";

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function AdminPaymentsQueue({ initialPayments }: { initialPayments: AdminPaymentView[] }) {
  const [payments, setPayments] = useState(initialPayments);
  const [selectedId, setSelectedId] = useState<string | null>(initialPayments[0]?.paymentId ?? null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<PaymentRejectionReason | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = payments.find((p) => p.paymentId === selectedId) ?? null;

  function selectPayment(paymentId: string) {
    setSelectedId(paymentId);
    setRejecting(false);
    setReason(null);
    setError(null);
  }

  async function refetchQueue(): Promise<AdminPaymentView[]> {
    const result = await fetchAdminPayments("PENDING");
    if (!result.ok) {
      setError(result.message);
      return payments;
    }
    setPayments(result.data.items);
    return result.data.items;
  }

  async function handleApprove() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const result = await approvePayment(selected.paymentId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      await refetchQueue();
      return;
    }
    const fresh = await refetchQueue();
    setSelectedId(fresh[0]?.paymentId ?? null);
    setRejecting(false);
    setReason(null);
    setMessage(`Pedido #${result.data.orderNumber} aprobado. Licencia asignada y correo en cola.`);
  }

  async function handleConfirmReject() {
    if (!selected || !reason) return;
    setSubmitting(true);
    setError(null);
    const result = await rejectPayment(selected.paymentId, reason);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      await refetchQueue();
      return;
    }
    const fresh = await refetchQueue();
    setSelectedId(fresh[0]?.paymentId ?? null);
    setRejecting(false);
    setReason(null);
    setMessage(`Pedido #${result.data.orderNumber} rechazado.`);
  }

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}
      {payments.length === 0 ? (
        <div className="rounded-2xl border border-line-soft bg-surface p-14 text-center">
          <p className="font-display text-xl font-bold text-ink">Estás al día</p>
          <p className="mt-1 text-muted">No hay pagos pendientes. Cuando un cliente suba un comprobante, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <p className="text-muted">{payments.length} pendientes</p>
          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Cola de pagos" className="flex w-full max-w-[360px] flex-col gap-2">
              {payments.map((p) => {
                const active = p.paymentId === selectedId;
                return (
                  <button
                    key={p.paymentId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectPayment(p.paymentId)}
                    className={`flex flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left ${
                      active ? "border-accent bg-accent-soft-bg" : "border-line-soft bg-surface"
                    }`}
                  >
                    <span className="flex w-full justify-between gap-2 font-semibold text-ink">
                      <span>{p.customerName ?? p.customerEmail}</span>
                      <span>{formatPriceCents(p.totalCents, p.currency)}</span>
                    </span>
                    <span className="text-sm text-muted">
                      {p.items.map((item) => `${item.productName} · ${item.planName}`).join(", ")}
                    </span>
                    <span className="text-sm text-muted">
                      {p.paymentMethodName} · hace {minutesAgo(p.createdAt)} min
                    </span>
                  </button>
                );
              })}
            </section>
            {selected ? (
              <AdminPaymentDetail
                key={selected.paymentId}
                payment={selected}
                rejecting={rejecting}
                reason={reason}
                submitting={submitting}
                onApprove={handleApprove}
                onStartReject={() => setRejecting(true)}
                onCancelReject={() => {
                  setRejecting(false);
                  setReason(null);
                }}
                onPickReason={setReason}
                onConfirmReject={handleConfirmReject}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implementar `/admin/pagos/page.tsx`**

Crear `frontend/src/app/admin/pagos/page.tsx`:

```tsx
import { AdminPaymentsQueue } from "@/components/admin-payments-queue";
import { fetchAdminPayments } from "@/lib/admin-payments-client";

export default async function AdminPagosPage() {
  const result = await fetchAdminPayments("PENDING");

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Pagos por revisar</h1>
      {!result.ok ? (
        <p className="text-danger-ink">{result.message}</p>
      ) : (
        <AdminPaymentsQueue initialPayments={result.data.items} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar que el proyecto compila**

Run: `cd frontend && npx next typegen && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Probar manualmente**

Con backend y frontend corriendo: completar el flujo de checkout como cliente (`/p/producto-demo` → comprar → subir comprobante) para dejar un pago `PENDING` real. Luego, en otra sesión/pestaña, iniciar sesión como admin y visitar `/admin/pagos`. Verificar: aparece el pago en la cola con nombre/correo del cliente, producto/plan, método, stock, N.º de operación; "Rechazar" abre el selector de motivos y "Confirmar rechazo" está deshabilitado hasta elegir uno; al confirmar, aparece el banner y la cola se actualiza; repetir con otro pago y "Aprobar y entregar licencia" (verificar que el pedido queda `DELIVERED` vía `GET /orders/:id` o el panel); con la cola vacía, se ve "Estás al día".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin-payment-detail.tsx frontend/src/components/admin-payments-queue.tsx frontend/src/app/admin/pagos/page.tsx
git commit -m "Frontend: pantalla de Pagos del panel admin (cola, detalle, aprobar/rechazar)"
```

---

### Task 5: E2E Playwright — flujo de rechazo y de aprobación

**Files:**
- Modify: `frontend/e2e/db.ts` (agrega `releaseDeliveredOrderLicense`)
- Create: `frontend/e2e/admin-payments.spec.ts`

**Interfaces:**
- Consumes: `markEmailVerified`, `releaseOrderLicenses` de `./db` (ya existen, de la Task 15 del plan anterior); `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `backend/.env` (ya cargado por `e2e/global-setup.ts`).
- Produces: `releaseDeliveredOrderLicense(orderId): Promise<void>`; dos pruebas e2e nuevas.

> Igual que el flujo feliz de checkout (plan anterior), estas pruebas ejercitan el backend real con las 5 licencias fijas del seed. El test de rechazo no consume stock (la licencia sigue `RESERVED`, se libera con `releaseOrderLicenses`, ya existente). El test de aprobación sí vende una licencia (`SOLD`, pedido `DELIVERED`) — correcto y sin vuelta atrás vía API — así que su limpieza usa el helper nuevo de este task, solo para sostenibilidad del entorno de dev/test local.

- [ ] **Step 1: Agregar el helper de limpieza para pedidos aprobados**

En `frontend/e2e/db.ts`, agregar al final del archivo:

> **Nota (corregido durante la verificación manual de Tasks 1-4, previa a este Task 5):** el trigger
> `trg_license_status_guard` (`fn_license_status_guard`, migración de Fundaciones) solo permite
> `SOLD -> VOID`, nunca `SOLD -> AVAILABLE` — probado contra Postgres real. Reescribir el status de una
> licencia `SOLD` directo a `AVAILABLE` lanza `Transición de licencia no permitida: SOLD -> AVAILABLE`.
> La limpieza correcta es: `VOID` la licencia vendida (retiro permanente, consistente con la regla de
> dominio "una licencia nunca se asigna a dos pedidos") e `INSERT` una licencia nueva `AVAILABLE` para el
> mismo plan/lote, igual que hace `createCatalog` en `backend/test/utils/factories.ts` (`secretEncrypted:
> 'test:test:test'`, `secretHash` aleatorio) — así el pool de 5 licencias del seed queda igual de grande
> para la siguiente corrida del e2e, solo para sostenibilidad del entorno de dev/test local (no toca el
> trigger ni las reglas de dominio).

```ts
import { randomBytes } from "node:crypto";

// Aprobar vende la licencia (SOLD) y entrega el pedido (DELIVERED) — correcto y sin vuelta atrás vía
// API (no existe un endpoint de "deshacer entrega"). Una licencia SOLD nunca vuelve a AVAILABLE (lo
// bloquea trg_license_status_guard) así que, solo para sostenibilidad del entorno de dev/test local
// (cuentas de prueba descartables, no datos de producción), se la retira (VOID) y se repone una licencia
// nueva AVAILABLE del mismo plan/lote para que el e2e de aprobación sea repetible sin agotar las 5
// licencias fijas del seed.
export async function releaseDeliveredOrderLicense(orderId: string): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string; planId: string; batchId: string }>(
      `SELECT li.id, li."planId", li."batchId"
         FROM license_items li
         JOIN order_items oi ON li."orderItemId" = oi.id
        WHERE oi."orderId" = $1 AND li.status = 'SOLD'`,
      [orderId],
    );
    for (const row of rows) {
      await client.query(
        `INSERT INTO license_items ("planId", "batchId", "secretEncrypted", "secretHash", status)
         VALUES ($1, $2, 'test:test:test', $3, 'AVAILABLE')`,
        [row.planId, row.batchId, randomBytes(32).toString("hex")],
      );
      await client.query(`UPDATE license_items SET status = 'VOID' WHERE id = $1`, [row.id]);
    }
    await client.query(
      `UPDATE orders SET status = 'CANCELLED', "cancelReason" = 'E2E_TEST_CLEANUP' WHERE id = $1`,
      [orderId],
    );
  });
}
```

- [ ] **Step 2: Escribir el test**

Crear `frontend/e2e/admin-payments.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { markEmailVerified, releaseDeliveredOrderLicense, releaseOrderLicenses } from "./db";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function registerAndLoginCustomer(
  page: import("@playwright/test").Page,
): Promise<{ orderId: string; name: string }> {
  const email = `e2e-admin-flow-${Date.now()}@freecell.test`;
  const name = `Cliente Admin E2E ${Date.now()}`;
  const password = "Contrasena#123";

  const registerRes = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name },
  });
  expect(registerRes.ok()).toBeTruthy();
  await markEmailVerified(email);

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.route("**/*.r2.cloudflarestorage.com/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.goto("/p/producto-demo");
  await page.getByRole("button", { name: "Comprar ahora" }).click();
  await expect(page).toHaveURL("/checkout");
  await page.getByRole("button", { name: "Continuar a pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/.+\/pago/);

  const orderId = page.url().match(/\/checkout\/([^/]+)\/pago/)?.[1];
  if (!orderId) throw new Error("No se pudo extraer el orderId de la URL");

  await page.getByLabel("N.º de operación").fill(`OP-${Date.now()}`);
  await page.getByLabel(/Comprobante/).setInputFiles({
    name: "comprobante.png",
    mimeType: "image/png",
    buffer: Buffer.from(`comprobante-admin-e2e-${Date.now()}`),
  });
  await page.getByLabel(/Declaro ser propietario/).check();
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/.+\/entrega/);

  return { orderId, name };
}

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

test("admin rechaza un pago: vuelve a PENDING_PAYMENT y desaparece de la cola", async ({ page }) => {
  const { orderId, name } = await registerAndLoginCustomer(page);

  await loginAsAdmin(page);
  await page.goto("/admin/pagos");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Rechazar" }).click();
  await page.getByRole("button", { name: "Comprobante ilegible" }).click();
  await page.getByRole("button", { name: "Confirmar rechazo" }).click();

  await expect(page.getByText(/rechazado/)).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);

  await releaseOrderLicenses(orderId);
});

test("admin aprueba un pago: entrega la licencia y desaparece de la cola", async ({ page }) => {
  const { orderId, name } = await registerAndLoginCustomer(page);

  await loginAsAdmin(page);
  await page.goto("/admin/pagos");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Aprobar y entregar licencia" }).click();

  await expect(page.getByText(/aprobado/)).toBeVisible();
  await expect(page.getByText(name)).toHaveCount(0);

  await releaseDeliveredOrderLicense(orderId);
});
```

- [ ] **Step 3: Correr el test y verificar que falla o pasa según el estado real del backend dev**

Run: `cd backend && npm run start:dev` (otra terminal), luego `cd frontend && npm run test:e2e -- admin-payments.spec.ts`
Expected en este punto (Tasks 1–4 ya implementadas): debería **pasar**. Si falla, revisar en orden: ¿el seed corrió y existe `producto-demo` con stock? ¿`ADMIN_EMAIL`/`ADMIN_PASSWORD` de `backend/.env` corresponden a un admin ya seedeado?

- [ ] **Step 4: Ajustar hasta que pase**

Run: `cd frontend && npm run test:e2e -- admin-payments.spec.ts`
Expected: PASS (2 tests). Si falla por timing del banner o de la cola, no es un bug de la UI — revisar primero si el mensaje de éxito usa exactamente `aprobado`/`rechazado` como en `admin-payments-queue.tsx` (Task 4).

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/db.ts frontend/e2e/admin-payments.spec.ts
git commit -m "Frontend: e2e del panel admin de pagos (rechazo y aprobacion)"
```

---

### Task 6: Actualizar documentación de cierre

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md`
- Modify: `docs/06-api.md`
- Modify: `docs/10-orden-de-ejecucion.md`

**Interfaces:** ninguna (solo documentación).

- [ ] **Step 1: Actualizar RF-ADM-10 a RF-ADM-13**

En `docs/02-requerimientos-funcionales.md`, buscar cada fila por su código exacto (no asumir número de línea) y reemplazar la columna de estado:

```
| RF-ADM-10 | Cola de pagos pendientes ordenada por antigüedad, con cliente, producto, monto, método y tiempo de espera. | M | ✅ (2026-11-07) |
```

```
| RF-ADM-11 | Ver el comprobante junto al monto esperado, el método, la reserva restante y el stock disponible, sin cambiar de pantalla. | M | ✅ (2026-11-07) |
```

```
| RF-ADM-12 | **Aprobar y entregar:** en una transacción, la licencia reservada pasa a `SOLD`, el pedido a `DELIVERED`, el pago a `APPROVED`; se encola el correo con clave y se registra auditoría. Tras aprobar, la UI pasa al siguiente pago. | M | ✅ (2026-11-07; el envío real del correo de la cola sigue pendiente, es trabajo aparte) |
```

```
| RF-ADM-13 | **Rechazar** con motivo predefinido (monto incorrecto, comprobante ilegible, operación no encontrada); el motivo se muestra al cliente. | M | ✅ (2026-11-07) |
```

- [ ] **Step 2: Actualizar `docs/06-api.md`**

Buscar la fila de `GET /admin/payments` y reemplazarla:

```
| ✅ | `GET /admin/payments?status=PENDING` | Cola ordenada por antigüedad (`createdAt` asc), con URL firmada de lectura del comprobante, monto, moneda, reserva restante e ítems (con nombre de producto/plan y stock disponible por ítem); incluye nombre/correo del cliente y nombre del método de pago. |
```

- [ ] **Step 3: Cerrar el paso 4 del roadmap**

En `docs/10-orden-de-ejecucion.md`, cambiar la fila del paso 4:

```
| 4 | ✅ Frontend: panel admin de pagos (S6) — 2026-11-07 | Junto con el paso 1, cierra el loop compra→aprobación→entrega de forma visible y probable. |
```

Y al final del archivo, la sección "## Estado":

```
## Estado (2026-11-07)

Paso 1 completo (`/admin/payments`: list/approve/reject, migración `AdminPaymentFunctions`, 15 pruebas e2e).
Paso 2 completo (catálogo del frontend conectado a la API real — 2026-11-02).
Paso 3 completo (página producto, carrito y checkout de 3 pasos — 2026-11-03).
Paso 4 completo (panel admin de pagos, S6 — 2026-11-07).
Próximo: **paso 5** (inventario, S7).
```

- [ ] **Step 4: Commit**

```bash
git add docs/02-requerimientos-funcionales.md docs/06-api.md docs/10-orden-de-ejecucion.md
git commit -m "Docs: cierre del panel admin de pagos (S6) en RF-ADM-10..13, docs/06 y orden de ejecucion"
```

---

## Self-Review

**Cobertura del spec:** extensión del DTO con nombre de cliente/método/producto/plan y stock (Task 1, incluye el campo `paymentMethodName` que no estaba explícito en el spec pero es necesario para el campo "Método" del mockup — corregido durante la escritura de este plan); shell de `/admin` con sidebar completo y placeholders (Task 3); pantalla maestro-detalle con checklist, selector de motivo bloqueado hasta elegir, banner de éxito, estado vacío, refetch tras cada acción (Task 4); comprobante como imagen o link PDF según extensión (Task 4, `admin-payment-detail.tsx`); countdown informativo sin gating (Task 4, reutiliza `<Countdown>` sin `onExpire`); testing unitario/integración/e2e (Tasks 1, 2, 5); documentación (Task 6). Todo lo listado en "Fuera de alcance" del spec (AdminInicio/S5, Inventario real/S7, Reclamos/S8, envío real de correo, checklist como gate) no tiene tareas aquí — correcto.

**Placeholders:** ninguno — cada step entrega el archivo completo, sin "TBD" ni versiones rotas intermedias.

**Consistencia de tipos:** `AdminPaymentView`/`AdminPaymentItemView` (Task 2) se usan igual en `admin-payment-detail.tsx` y `admin-payments-queue.tsx` (Task 4); `PaymentRejectionReason` (Task 2) es el mismo tipo en el picker de motivos (Task 4) y en `rejectPayment` (Task 2); `approvePayment`/`rejectPayment` devuelven `OrderView` (reutilizado de `orders-client.ts`, no un tipo nuevo) y así se usa en `admin-payments-queue.tsx` (`result.data.orderNumber`); `fetchAdminPayments("PENDING", 1)` en el layout (Task 3) y `fetchAdminPayments("PENDING")` en la página (Task 4) usan la misma firma de Task 2.
