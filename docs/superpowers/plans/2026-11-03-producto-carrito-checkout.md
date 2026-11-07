# Página de producto, carrito y checkout — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `/p/[slug]` (ficha de producto), el carrito (client-side) y el checkout de 3 pasos (`/checkout`, `/checkout/[orderId]/pago`, `/checkout/[orderId]/entrega`) consumiendo la API de pedidos/pagos que ya existe en el backend.

**Architecture:** Carrito en `React Context` + `localStorage` (sin backend hasta confirmar). El pedido real se crea (`POST /orders`, reserva de stock) solo al confirmar el Resumen del checkout. Las mutaciones contra el backend autenticado (`createOrder`, `getOrder`, `requestPaymentUploadUrl`, `submitPayment`, `resendVerificationEmail`) son Server Actions (`"use server"`) que leen `session.accessToken` vía `auth()`, siguiendo el mismo patrón que `src/lib/auth-actions.ts`. El archivo del comprobante se sube directo del navegador a R2 con la URL firmada (nunca pasa por nuestro servidor); el hash SHA-256 se calcula en el cliente con `crypto.subtle` (D71).

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), React 19, TypeScript, Tailwind v4, Vitest (unidad/integración, solo `.ts`), Playwright (e2e, contra el backend real).

**Spec:** `docs/superpowers/specs/2026-11-03-producto-carrito-checkout-design.md`

## Global Constraints

- Moneda fija `PEN` en todo este alcance (sin selector PEN/USD; eso es una mejora posterior). Todas las llamadas a `POST /orders` envían `currency: "PEN"`.
- Objetivos táctiles ≥44px (`h-11`/`min-h-11`), el color nunca es el único indicador de estado (CLAUDE.md, accesibilidad AA).
- Nunca mostrar números en vivo inventados; solo datos reales de la API o políticas ya decididas (ej. "reserva de 30 min" viene de `expiresAt`, no de un texto fijo con un número distinto).
- Entidades/código en inglés, copy de usuario en español (es-PE).
- Tipos usados solo como tipo van con `import type` salvo el caso de DI con decoradores (no aplica en este plan: frontend, sin NestJS).
- No se toca ningún contrato de backend: todos los endpoints usados ya existen y están probados (Sprint 1/2).
- Tokens de diseño ya fijados en `src/app/globals.css` (no se agregan colores nuevos): `--color-ink`, `--color-muted`, `--color-surface`, `--color-line`/`-soft`/`-strong`, `--color-accent`(+`-hover`/`-press`), `--color-accent-soft-bg`/`-ink`, `--color-success`/`-warning`/`-danger` (`-ink`/`-bg`). Radios: `rounded-[10px]` controles, `rounded-2xl` tarjetas. Tipografía: `font-display` (Space Grotesk, títulos/precios) y por defecto IBM Plex Sans.
- Vitest solo cubre `src/**/*.test.ts` (no `.tsx`): no existen tests de componentes React en este repo (no hay jsdom ni Testing Library instalados). El comportamiento de UI se cubre con Playwright. No instalar jsdom/Testing Library para este plan — seguir la convención existente.
- `qty` por plan: 1–5 (`CreateOrderItemDto.qty`, backend). Carrito: máx. 10 planes distintos (`CreateOrderDto.items`, backend `ArrayMaxSize(10)`). El frontend debe clampear a los mismos límites antes de enviar, para no depender solo del 400 del backend.
- Mensajes de error del backend llegan como `{ statusCode, message: string | string[], error }` (`backend/src/common/filters/all-exceptions.filter.ts`). `message` puede ser un array (errores de validación) — unirlo para mostrarlo.

---

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `src/lib/catalog-client.ts` | *(modificado)* suma `fetchProductDetail` |
| `src/lib/cart-logic.ts` | *(nuevo)* funciones puras del carrito (sin React) |
| `src/lib/cart-logic.test.ts` | *(nuevo)* tests de lo anterior |
| `src/lib/cart-context.tsx` | *(nuevo)* `CartProvider` + `useCart()` (React Context + localStorage) |
| `src/lib/proof-hash.ts` | *(nuevo)* SHA-256 del comprobante, calculado en cliente |
| `src/lib/proof-hash.test.ts` | *(nuevo)* |
| `src/lib/use-countdown.ts` | *(nuevo)* `msRemaining()` puro + hook `useCountdown()` |
| `src/lib/use-countdown.test.ts` | *(nuevo)* tests de `msRemaining()` |
| `src/lib/order-meta.ts` | *(nuevo)* caché en `localStorage` de nombre/plan por `orderId` (el backend no devuelve nombres, solo `planId`) |
| `src/lib/orders-client.ts` | *(nuevo)* Server Actions: `createOrder`, `getOrder`, `requestPaymentUploadUrl`, `submitPayment`, `resendVerificationEmail` |
| `src/lib/orders-client.test.ts` | *(nuevo)* |
| `src/components/product-tabs.tsx` | *(nuevo)* pestañas Descripción/Cómo activar/Preguntas |
| `src/components/plan-picker.tsx` | *(nuevo)* toggle NEW/RENEWAL, cantidad, añadir/comprar |
| `src/components/countdown.tsx` | *(nuevo)* UI de cuenta regresiva |
| `src/components/cart-badge.tsx` | *(nuevo)* contador en el header |
| `src/components/checkout-summary.tsx` | *(nuevo)* Resumen del carrito + "Continuar a pago" |
| `src/components/payment-form.tsx` | *(nuevo)* método de pago, subir comprobante, declaración legal |
| `src/app/p/[slug]/page.tsx` | *(nuevo)* ficha de producto |
| `src/app/checkout/page.tsx` | *(nuevo)* paso Resumen |
| `src/app/checkout/[orderId]/pago/page.tsx` | *(nuevo)* paso Pago |
| `src/app/checkout/[orderId]/entrega/page.tsx` | *(nuevo)* paso Entrega |
| `src/app/layout.tsx` | *(modificado)* envuelve `children` en `<CartProvider>` |
| `src/proxy.ts` | *(modificado)* agrega `/checkout` a las rutas protegidas |
| `src/components/site-header.tsx` | *(modificado)* agrega `<CartBadge />` |
| `src/components/catalog-grid.tsx` | *(modificado)* envuelve `<ProductCard>` en `<Link href="/p/[slug]">` |
| `frontend/package.json` | *(modificado)* agrega `pg` como devDependency (solo para el e2e) |
| `frontend/e2e/db.ts` | *(nuevo)* helper de conexión directa a Postgres para verificar el correo del usuario de prueba |
| `frontend/e2e/checkout.spec.ts` | *(nuevo)* flujo feliz + caso negativo (reserva vencida) |
| `docs/02-requerimientos-funcionales.md` | *(modificado)* RF-COM-03 pasa a ✅ (parcial: sin selector de moneda) |
| `docs/10-orden-de-ejecucion.md` | *(modificado)* paso 3 ✅ |

---

### Task 1: `fetchProductDetail` en `catalog-client.ts`

**Files:**
- Modify: `frontend/src/lib/catalog-client.ts`
- Test: `frontend/src/lib/catalog-client.test.ts` (agrega un `describe` nuevo al final)

**Interfaces:**
- Consumes: nada nuevo (sigue el patrón de `getJson`/`API_URL` ya existente en el archivo).
- Produces: `CatalogProductDetail`, `PlanOffer`, `PlanPrice`, `fetchProductDetail(slug: string): Promise<CatalogProductDetail | null>` — usados por la Task 10 (`/p/[slug]/page.tsx`).

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `frontend/src/lib/catalog-client.test.ts`:

```ts
describe("fetchProductDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve la ficha del producto parseada", async () => {
    const payload = {
      id: "p1",
      name: "UnlockTool",
      slug: "unlocktool",
      description: "Desbloquea el equipo",
      whatIncluded: "1 licencia",
      compatibility: "Android",
      activationGuide: "Paso 1...",
      faq: [{ question: "¿Cuánto dura?", answer: "30 días" }],
      categoryName: "Desbloqueo",
      requiresToolUsername: false,
      plans: [
        {
          id: "plan-1",
          name: "Plan mensual",
          kind: "NEW",
          durationDays: 30,
          prices: [{ currency: "PEN", priceCents: 8900 }],
          stockState: "IN_STOCK",
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProductDetail("unlocktool");

    expect(result).toEqual(payload);
    expect((fetchMock.mock.calls[0][0] as string)).toContain("/catalog/products/unlocktool");
  });

  it("devuelve null si el producto no existe (404)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProductDetail("no-existe");

    expect(result).toBeNull();
  });

  it("lanza un error si el backend responde con otro status de error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProductDetail("unlocktool")).rejects.toThrow();
  });
});
```

Y actualizar el import al tope del archivo:

```ts
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  fetchPaymentMethods,
  fetchProductDetail,
} from "./catalog-client";
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npm run test:unit -- src/lib/catalog-client.test.ts`
Expected: FAIL — `fetchProductDetail is not a function` / `is not exported`.

- [ ] **Step 3: Implementar**

Agregar a `frontend/src/lib/catalog-client.ts` (después de `PaymentMethod`, antes de `getJson` o después, da igual — mantener junto a los demás tipos):

```ts
export interface PlanPrice {
  currency: Currency;
  priceCents: number;
}

export interface PlanOffer {
  id: string;
  name: string;
  kind: "NEW" | "RENEWAL";
  durationDays: number;
  prices: PlanPrice[];
  stockState: StockState;
}

export interface CatalogProductDetail {
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
  plans: PlanOffer[];
}
```

Y la función, junto a las demás `fetch*`:

```ts
export async function fetchProductDetail(slug: string): Promise<CatalogProductDetail | null> {
  const res = await fetch(`${API_URL}/catalog/products/${slug}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar /catalog/products/${slug}`);
  }
  return (await res.json()) as CatalogProductDetail;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npm run test:unit -- src/lib/catalog-client.test.ts`
Expected: PASS (todos los tests del archivo, los viejos y los 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/catalog-client.ts frontend/src/lib/catalog-client.test.ts
git commit -m "Frontend: fetchProductDetail para la ficha de producto (GET /catalog/products/:slug)"
```

---

### Task 2: `cart-logic.ts` — funciones puras del carrito

**Files:**
- Create: `frontend/src/lib/cart-logic.ts`
- Test: `frontend/src/lib/cart-logic.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `CartItem`, `CART_MAX_QTY_PER_PLAN` (=5), `CART_MAX_DISTINCT_PLANS` (=10), `addToCart()`, `updateQty()`, `removeFromCart()`, `cartTotalCents()`, `cartItemCount()`, `cartRequiresToolUsername()` — usados por `cart-context.tsx` (Task 3).

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/cart-logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CART_MAX_DISTINCT_PLANS,
  CART_MAX_QTY_PER_PLAN,
  addToCart,
  cartItemCount,
  cartRequiresToolUsername,
  cartTotalCents,
  removeFromCart,
  updateQty,
  type CartItem,
} from "./cart-logic";

function makeItem(overrides: Partial<CartItem> = {}): Omit<CartItem, "qty"> {
  return {
    planId: "plan-1",
    productSlug: "unlocktool",
    productName: "UnlockTool",
    planName: "Plan mensual",
    kind: "NEW",
    unitPriceCents: 8900,
    requiresToolUsername: false,
    ...overrides,
  };
}

describe("addToCart", () => {
  it("agrega un plan nuevo al carrito vacío", () => {
    const result = addToCart([], makeItem(), 2);
    expect(result.ok).toBe(true);
    expect(result.items).toEqual([{ ...makeItem(), qty: 2 }]);
  });

  it("suma cantidad si el plan ya está en el carrito", () => {
    const existing: CartItem[] = [{ ...makeItem(), qty: 2 }];
    const result = addToCart(existing, makeItem(), 1);
    expect(result.ok).toBe(true);
    expect(result.items[0].qty).toBe(3);
  });

  it("no deja superar CART_MAX_QTY_PER_PLAN para el mismo plan", () => {
    const existing: CartItem[] = [{ ...makeItem(), qty: CART_MAX_QTY_PER_PLAN }];
    const result = addToCart(existing, makeItem(), 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MAX_QTY");
    expect(result.items).toBe(existing);
  });

  it("clampea la cantidad inicial a CART_MAX_QTY_PER_PLAN", () => {
    const result = addToCart([], makeItem(), 99);
    expect(result.ok).toBe(true);
    expect(result.items[0].qty).toBe(CART_MAX_QTY_PER_PLAN);
  });

  it("no deja superar CART_MAX_DISTINCT_PLANS", () => {
    const existing: CartItem[] = Array.from({ length: CART_MAX_DISTINCT_PLANS }, (_, i) => ({
      ...makeItem({ planId: `plan-${i}` }),
      qty: 1,
    }));
    const result = addToCart(existing, makeItem({ planId: "plan-nuevo" }), 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MAX_PLANS");
  });
});

describe("updateQty", () => {
  it("actualiza la cantidad de un plan existente", () => {
    const items: CartItem[] = [{ ...makeItem(), qty: 1 }];
    const result = updateQty(items, "plan-1", 4);
    expect(result[0].qty).toBe(4);
  });

  it("clampea entre 1 y CART_MAX_QTY_PER_PLAN", () => {
    const items: CartItem[] = [{ ...makeItem(), qty: 1 }];
    expect(updateQty(items, "plan-1", 0)[0].qty).toBe(1);
    expect(updateQty(items, "plan-1", 99)[0].qty).toBe(CART_MAX_QTY_PER_PLAN);
  });
});

describe("removeFromCart", () => {
  it("quita el plan indicado", () => {
    const items: CartItem[] = [{ ...makeItem(), qty: 1 }];
    expect(removeFromCart(items, "plan-1")).toEqual([]);
  });
});

describe("cartTotalCents / cartItemCount / cartRequiresToolUsername", () => {
  it("suma precio*cantidad de todos los ítems", () => {
    const items: CartItem[] = [
      { ...makeItem({ planId: "plan-1", unitPriceCents: 1000 }), qty: 2 },
      { ...makeItem({ planId: "plan-2", unitPriceCents: 500 }), qty: 3 },
    ];
    expect(cartTotalCents(items)).toBe(2 * 1000 + 3 * 500);
    expect(cartItemCount(items)).toBe(5);
  });

  it("es true si algún ítem requiere toolUsername", () => {
    const items: CartItem[] = [
      { ...makeItem({ planId: "plan-1", requiresToolUsername: false }), qty: 1 },
      { ...makeItem({ planId: "plan-2", requiresToolUsername: true }), qty: 1 },
    ];
    expect(cartRequiresToolUsername(items)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npm run test:unit -- src/lib/cart-logic.test.ts`
Expected: FAIL — el módulo `./cart-logic` no existe.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/cart-logic.ts`:

```ts
export interface CartItem {
  planId: string;
  productSlug: string;
  productName: string;
  planName: string;
  kind: "NEW" | "RENEWAL";
  unitPriceCents: number;
  requiresToolUsername: boolean;
  qty: number;
}

export const CART_MAX_QTY_PER_PLAN = 5;
export const CART_MAX_DISTINCT_PLANS = 10;

export type CartAddResult =
  | { ok: true; items: CartItem[] }
  | { ok: false; items: CartItem[]; reason: "MAX_QTY" | "MAX_PLANS" };

function clampQty(qty: number): number {
  return Math.min(Math.max(qty, 1), CART_MAX_QTY_PER_PLAN);
}

export function addToCart(
  items: CartItem[],
  entry: Omit<CartItem, "qty">,
  qty: number,
): CartAddResult {
  const existing = items.find((item) => item.planId === entry.planId);

  if (existing) {
    const nextQty = Math.min(existing.qty + qty, CART_MAX_QTY_PER_PLAN);
    if (nextQty === existing.qty) {
      return { ok: false, items, reason: "MAX_QTY" };
    }
    return {
      ok: true,
      items: items.map((item) =>
        item.planId === entry.planId ? { ...item, qty: nextQty } : item,
      ),
    };
  }

  if (items.length >= CART_MAX_DISTINCT_PLANS) {
    return { ok: false, items, reason: "MAX_PLANS" };
  }

  return { ok: true, items: [...items, { ...entry, qty: clampQty(qty) }] };
}

export function updateQty(items: CartItem[], planId: string, qty: number): CartItem[] {
  const clamped = clampQty(qty);
  return items.map((item) => (item.planId === planId ? { ...item, qty: clamped } : item));
}

export function removeFromCart(items: CartItem[], planId: string): CartItem[] {
  return items.filter((item) => item.planId !== planId);
}

export function cartTotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0);
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

export function cartRequiresToolUsername(items: CartItem[]): boolean {
  return items.some((item) => item.requiresToolUsername);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npm run test:unit -- src/lib/cart-logic.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cart-logic.ts frontend/src/lib/cart-logic.test.ts
git commit -m "Frontend: funciones puras del carrito (cart-logic)"
```

---

### Task 3: `cart-context.tsx` — Provider + `useCart()`

**Files:**
- Create: `frontend/src/lib/cart-context.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: `CartItem`, `CartAddResult`, `addToCart`, `updateQty`, `removeFromCart`, `cartTotalCents`, `cartItemCount`, `cartRequiresToolUsername` de `./cart-logic` (Task 2).
- Produces: `CartProvider` (componente), `useCart(): { items, add, updateQty, remove, clear, totalCents, itemCount, requiresToolUsername }` — usado por `plan-picker.tsx` (Task 9), `cart-badge.tsx` (Task 10), `checkout-summary.tsx` (Task 12).

No tiene test de Vitest propio (componente React con `localStorage`; sin jsdom en este repo, ver "Global Constraints"). Se verifica manualmente en Task 10 y se cubre en el e2e de la Task 15.

- [ ] **Step 1: Implementar**

Crear `frontend/src/lib/cart-context.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  addToCart as addToCartLogic,
  cartItemCount,
  cartRequiresToolUsername,
  cartTotalCents,
  removeFromCart,
  updateQty as updateQtyLogic,
  type CartAddResult,
  type CartItem,
} from "./cart-logic";

const STORAGE_KEY = "freecell:cart";

interface CartContextValue {
  items: CartItem[];
  add: (entry: Omit<CartItem, "qty">, qty: number) => CartAddResult;
  updateQty: (planId: string, qty: number) => void;
  remove: (planId: string) => void;
  clear: () => void;
  totalCents: number;
  itemCount: number;
  requiresToolUsername: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readStoredCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const value: CartContextValue = {
    items,
    add: (entry, qty) => {
      const result = addToCartLogic(items, entry, qty);
      if (result.ok) setItems(result.items);
      return result;
    },
    updateQty: (planId, qty) => setItems((current) => updateQtyLogic(current, planId, qty)),
    remove: (planId) => setItems((current) => removeFromCart(current, planId)),
    clear: () => setItems([]),
    totalCents: cartTotalCents(items),
    itemCount: cartItemCount(items),
    requiresToolUsername: cartRequiresToolUsername(items),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart debe usarse dentro de <CartProvider>");
  }
  return ctx;
}
```

- [ ] **Step 2: Envolver la app en `CartProvider`**

Modificar `frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import { CartProvider } from "@/lib/cart-context";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Free Cell — Licencias para herramientas de servicio técnico",
  description:
    "Compra licencias de herramientas de servicio técnico de celulares: entrega rápida, pago por Yape/Plin/transferencia y soporte ante reclamos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
```

(Único cambio: import de `CartProvider` y envolver `{children}`.)

- [ ] **Step 3: Verificar que el proyecto compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/cart-context.tsx frontend/src/app/layout.tsx
git commit -m "Frontend: CartProvider (carrito en Context + localStorage)"
```

---

### Task 4: `proof-hash.ts` — SHA-256 del comprobante en el cliente

**Files:**
- Create: `frontend/src/lib/proof-hash.ts`
- Test: `frontend/src/lib/proof-hash.test.ts`

**Interfaces:**
- Consumes: nada (usa el `crypto.subtle` global, disponible en Node ≥20 y en el navegador).
- Produces: `computeProofHash(file: File | Blob): Promise<string>` — usado por `payment-form.tsx` (Task 13). El valor debe matchear `/^[a-f0-9]{64}$/` (regex que valida el backend en `SubmitPaymentDto.proofHash`).

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/proof-hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeProofHash } from "./proof-hash";

describe("computeProofHash", () => {
  it("calcula el SHA-256 en hex del contenido del archivo", async () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b982
    const file = new File([new TextEncoder().encode("hello")], "comprobante.png", {
      type: "image/png",
    });

    const hash = await computeProofHash(file);

    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b982");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("da hashes distintos para contenidos distintos", async () => {
    const fileA = new File([new TextEncoder().encode("a")], "a.png");
    const fileB = new File([new TextEncoder().encode("b")], "b.png");

    const [hashA, hashB] = await Promise.all([computeProofHash(fileA), computeProofHash(fileB)]);

    expect(hashA).not.toBe(hashB);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npm run test:unit -- src/lib/proof-hash.test.ts`
Expected: FAIL — el módulo `./proof-hash` no existe.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/proof-hash.ts`:

```ts
export async function computeProofHash(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npm run test:unit -- src/lib/proof-hash.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/proof-hash.ts frontend/src/lib/proof-hash.test.ts
git commit -m "Frontend: computeProofHash (SHA-256 del comprobante en el cliente, D71)"
```

---

### Task 5: `use-countdown.ts` — cálculo puro + hook

**Files:**
- Create: `frontend/src/lib/use-countdown.ts`
- Test: `frontend/src/lib/use-countdown.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `msRemaining(expiresAtIso: string, nowMs: number): number`, `useCountdown(expiresAtIso: string): { remainingMs: number; expired: boolean }` — usados por `countdown.tsx` (Task 6).

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/use-countdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { msRemaining } from "./use-countdown";

describe("msRemaining", () => {
  it("devuelve el tiempo restante en milisegundos", () => {
    const expiresAt = new Date("2026-11-03T15:30:00.000Z").toISOString();
    const now = new Date("2026-11-03T15:00:00.000Z").getTime();

    expect(msRemaining(expiresAt, now)).toBe(30 * 60_000);
  });

  it("nunca devuelve negativo (clampea a 0 si ya venció)", () => {
    const expiresAt = new Date("2026-11-03T15:00:00.000Z").toISOString();
    const now = new Date("2026-11-03T15:30:00.000Z").getTime();

    expect(msRemaining(expiresAt, now)).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npm run test:unit -- src/lib/use-countdown.test.ts`
Expected: FAIL — el módulo `./use-countdown` no existe.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/use-countdown.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export function msRemaining(expiresAtIso: string, nowMs: number): number {
  return Math.max(0, new Date(expiresAtIso).getTime() - nowMs);
}

export function useCountdown(expiresAtIso: string): { remainingMs: number; expired: boolean } {
  const [remainingMs, setRemainingMs] = useState(() => msRemaining(expiresAtIso, Date.now()));

  useEffect(() => {
    setRemainingMs(msRemaining(expiresAtIso, Date.now()));
    const id = setInterval(() => {
      setRemainingMs(msRemaining(expiresAtIso, Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAtIso]);

  return { remainingMs, expired: remainingMs <= 0 };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npm run test:unit -- src/lib/use-countdown.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/use-countdown.ts frontend/src/lib/use-countdown.test.ts
git commit -m "Frontend: msRemaining + useCountdown para la reserva de 30 min"
```

---

### Task 6: `countdown.tsx` — UI de cuenta regresiva

**Files:**
- Create: `frontend/src/components/countdown.tsx`

**Interfaces:**
- Consumes: `useCountdown` de `@/lib/use-countdown` (Task 5).
- Produces: `<Countdown expiresAt={string} onExpire={() => void}>` — usado por `payment-form.tsx` (Task 13).

Sin test de Vitest (componente React sin jsdom). Se verifica visualmente en Task 13 y por e2e en Task 15.

- [ ] **Step 1: Implementar**

Crear `frontend/src/components/countdown.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useCountdown } from "@/lib/use-countdown";

export function Countdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire?: () => void;
}) {
  const { remainingMs, expired } = useCountdown(expiresAt);

  useEffect(() => {
    if (expired) onExpire?.();
  }, [expired, onExpire]);

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);

  return (
    <p
      className={`text-sm font-medium ${expired ? "text-danger-ink" : "text-ink"}`}
      role="timer"
      aria-live="polite"
    >
      {expired ? "Reserva vencida" : `Reserva vigente: ${minutes}:${String(seconds).padStart(2, "0")}`}
    </p>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/countdown.tsx
git commit -m "Frontend: componente Countdown para la reserva del pedido"
```

---

### Task 7: `order-meta.ts` — nombres de producto/plan por `orderId`

**Files:**
- Create: `frontend/src/lib/order-meta.ts`

**Interfaces:**
- Consumes: `CartItem` de `./cart-logic` (Task 2).
- Produces: `OrderMetaItem`, `saveOrderMeta(orderId: string, items: CartItem[]): void`, `readOrderMeta(orderId: string): OrderMetaItem[]` — usados por `checkout-summary.tsx` (Task 12) y las páginas de pago/entrega (Tasks 13–14).

`OrderResponseDto` del backend solo trae `{ planId, unitPriceCents }` por ítem (nunca el nombre del producto/plan — ver `backend/src/orders/dto/order-response.dto.ts`). Para mostrar "UnlockTool — Plan mensual" en pago/entrega sin tocar el contrato del backend, se guarda esa info de solo-lectura en `localStorage` en el momento en que se crea el pedido (Task 12), usando los mismos datos que ya están en el carrito.

Sin test de Vitest: ambas funciones hacen `if (typeof window === "undefined") return` como guardia (no hay `window`/`localStorage` en el entorno `node` de Vitest de este repo — ver "Global Constraints"), así que un test en ese entorno solo ejercitaría la rama vacía. Se verifica por e2e en Task 15.

- [ ] **Step 1: Implementar**

Crear `frontend/src/lib/order-meta.ts`:

```ts
import type { CartItem } from "./cart-logic";

export interface OrderMetaItem {
  planId: string;
  productName: string;
  planName: string;
  qty: number;
  unitPriceCents: number;
}

const STORAGE_PREFIX = "freecell:order-meta:";

export function saveOrderMeta(orderId: string, items: CartItem[]): void {
  if (typeof window === "undefined") return;
  const meta: OrderMetaItem[] = items.map((item) => ({
    planId: item.planId,
    productName: item.productName,
    planName: item.planName,
    qty: item.qty,
    unitPriceCents: item.unitPriceCents,
  }));
  window.localStorage.setItem(`${STORAGE_PREFIX}${orderId}`, JSON.stringify(meta));
}

export function readOrderMeta(orderId: string): OrderMetaItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${orderId}`);
    return raw ? (JSON.parse(raw) as OrderMetaItem[]) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/order-meta.ts
git commit -m "Frontend: order-meta (cache local de nombres de producto/plan por pedido)"
```

---

### Task 8: `orders-client.ts` — Server Actions de pedidos/pagos

**Files:**
- Create: `frontend/src/lib/orders-client.ts`
- Test: `frontend/src/lib/orders-client.test.ts`

**Interfaces:**
- Consumes: `auth` de `@/auth` (ya existe, ver `frontend/src/auth.ts`).
- Produces: `OrderView`, `OrdersActionResult<T>`, `createOrder()`, `getOrder()`, `requestPaymentUploadUrl()`, `submitPayment()`, `resendVerificationEmail()` — usados por `checkout-summary.tsx` (Task 12), las páginas de pago/entrega (Tasks 13–14) y `payment-form.tsx` (Task 13).

> Antes de implementar: este archivo usa Server Actions (`"use server"`), el mismo patrón que `frontend/src/lib/auth-actions.ts`. Si algo no calza, revisar `frontend/node_modules/next/dist/docs/` (Next 16 tiene cambios de ruptura — ver `frontend/AGENTS.md`).

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/orders-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("createOrder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("envía currency=PEN, items y toolUsername con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const orderPayload = {
      id: "order-1",
      orderNumber: 1,
      status: "PENDING_PAYMENT",
      totalCents: 8900,
      currency: "PEN",
      expiresAt: "2026-11-03T16:00:00.000Z",
      cancelReason: null,
      items: [{ planId: "plan-1", unitPriceCents: 8900 }],
      paymentStatus: null,
      paymentRejectionReason: null,
      tracking: { createdAt: "2026-11-03T15:30:00.000Z", paymentApprovedAt: null, deliveredAt: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(orderPayload), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }], "usuario-herramienta");

    expect(result).toEqual({ ok: true, data: orderPayload });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-123" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      currency: "PEN",
      items: [{ planId: "plan-1", qty: 1 }],
      toolUsername: "usuario-herramienta",
    });
  });

  it("devuelve ok:false con el mensaje del backend si falla (ej. 409 sin stock)", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 409, message: "Sin stock suficiente de Plan mensual", error: "Conflict" }), {
        status: 409,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }]);

    expect(result).toEqual({ ok: false, status: 409, message: "Sin stock suficiente de Plan mensual" });
  });

  it("devuelve ok:false sin llamar al backend si no hay sesión", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }]);

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("une el message en array (errores de validación) con coma", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 400, message: ["La cantidad mínima es 1", "moneda inválida"], error: "Bad Request" }), {
        status: 400,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createOrder } = await import("./orders-client");
    const result = await createOrder([{ planId: "plan-1", qty: 1 }]);

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "La cantidad mínima es 1, moneda inválida",
    });
  });
});

describe("getOrder / requestPaymentUploadUrl / submitPayment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("getOrder hace GET /orders/:id con el Bearer de la sesión", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { getOrder } = await import("./orders-client");
    await getOrder("order-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders/order-1");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("requestPaymentUploadUrl envía contentType y fileSizeBytes", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ uploadUrl: "https://r2/x", proofKey: "proofs/order-1/a.png" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { requestPaymentUploadUrl } = await import("./orders-client");
    const result = await requestPaymentUploadUrl("order-1", "image/png", 1024);

    expect(result).toEqual({ ok: true, data: { uploadUrl: "https://r2/x", proofKey: "proofs/order-1/a.png" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      contentType: "image/png",
      fileSizeBytes: 1024,
    });
  });

  it("submitPayment envía el body completo del pago", async () => {
    authMock.mockResolvedValue({ accessToken: "token-123" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order-1", status: "IN_REVIEW" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { submitPayment } = await import("./orders-client");
    await submitPayment("order-1", {
      paymentMethodId: "method-1",
      proofKey: "proofs/order-1/a.png",
      proofHash: "a".repeat(64),
      operationNumber: "123456",
      acceptsLegalDeclaration: true,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/orders/order-1/payment");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      paymentMethodId: "method-1",
      proofKey: "proofs/order-1/a.png",
      proofHash: "a".repeat(64),
      operationNumber: "123456",
      acceptsLegalDeclaration: true,
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npm run test:unit -- src/lib/orders-client.test.ts`
Expected: FAIL — el módulo `./orders-client` no existe.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/orders-client.ts`:

```ts
"use server";

import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type OrderStatusView =
  | "PENDING_PAYMENT"
  | "IN_REVIEW"
  | "PENDING_ACTIVATION"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderItemView {
  planId: string;
  unitPriceCents: number;
}

export interface OrderView {
  id: string;
  orderNumber: number;
  status: OrderStatusView;
  totalCents: number;
  currency: "PEN" | "USD";
  expiresAt: string;
  cancelReason: string | null;
  items: OrderItemView[];
  paymentStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  paymentRejectionReason: string | null;
  tracking: {
    createdAt: string;
    paymentApprovedAt: string | null;
    deliveredAt: string | null;
  };
}

export type OrdersActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<OrdersActionResult<T>> {
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

export async function createOrder(
  items: { planId: string; qty: number }[],
  toolUsername?: string,
): Promise<OrdersActionResult<OrderView>> {
  return callBackend<OrderView>("/orders", {
    method: "POST",
    body: { currency: "PEN", items, ...(toolUsername ? { toolUsername } : {}) },
  });
}

export async function getOrder(orderId: string): Promise<OrdersActionResult<OrderView>> {
  return callBackend<OrderView>(`/orders/${orderId}`, { method: "GET" });
}

export async function requestPaymentUploadUrl(
  orderId: string,
  contentType: "image/jpeg" | "image/png" | "application/pdf",
  fileSizeBytes: number,
): Promise<OrdersActionResult<{ uploadUrl: string; proofKey: string }>> {
  return callBackend(`/orders/${orderId}/payment/upload-url`, {
    method: "POST",
    body: { contentType, fileSizeBytes },
  });
}

export async function submitPayment(
  orderId: string,
  payload: {
    paymentMethodId: string;
    proofKey: string;
    proofHash: string;
    operationNumber: string;
    acceptsLegalDeclaration: boolean;
  },
): Promise<OrdersActionResult<OrderView>> {
  return callBackend<OrderView>(`/orders/${orderId}/payment`, { method: "POST", body: payload });
}

export async function resendVerificationEmail(): Promise<OrdersActionResult<undefined>> {
  return callBackend<undefined>("/auth/resend-verification", { method: "POST" });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npm run test:unit -- src/lib/orders-client.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/orders-client.ts frontend/src/lib/orders-client.test.ts
git commit -m "Frontend: Server Actions de pedidos/pagos (orders-client)"
```

---

### Task 9: `product-tabs.tsx` y `plan-picker.tsx`

**Files:**
- Create: `frontend/src/components/product-tabs.tsx`
- Create: `frontend/src/components/plan-picker.tsx`

**Interfaces:**
- Consumes: `CatalogProductDetail`, `PlanOffer` de `@/lib/catalog-client` (Task 1); `useCart` de `@/lib/cart-context` (Task 3); `formatPriceCents` de `@/lib/format` (ya existe); `StockBadge` de `@/components/stock-badge` (ya existe).
- Produces: `<ProductTabs product={CatalogProductDetail}>`, `<PlanPicker product={CatalogProductDetail}>` — usados por `/p/[slug]/page.tsx` (Task 10).

Sin test de Vitest (componentes React, sin jsdom). Verificación manual en Task 10 + e2e en Task 15.

- [ ] **Step 1: Implementar `product-tabs.tsx`**

Crear `frontend/src/components/product-tabs.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { CatalogProductDetail } from "@/lib/catalog-client";

type TabKey = "description" | "activation" | "faq";

const TABS: { key: TabKey; label: string }[] = [
  { key: "description", label: "Descripción" },
  { key: "activation", label: "Cómo activar" },
  { key: "faq", label: "Preguntas" },
];

export function ProductTabs({ product }: { product: CatalogProductDetail }) {
  const [active, setActive] = useState<TabKey>("description");

  return (
    <div>
      <div className="flex gap-2 border-b border-line" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
              active === tab.key ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="py-6 text-sm text-ink" role="tabpanel">
        {active === "description" ? (
          <div className="space-y-3">
            <p>{product.description ?? "Sin descripción todavía."}</p>
            {product.whatIncluded ? (
              <p>
                <span className="font-medium">Qué incluye:</span> {product.whatIncluded}
              </p>
            ) : null}
            {product.compatibility ? (
              <p>
                <span className="font-medium">Compatibilidad:</span> {product.compatibility}
              </p>
            ) : null}
          </div>
        ) : null}

        {active === "activation" ? (
          <p>{product.activationGuide ?? "Sin guía de activación todavía."}</p>
        ) : null}

        {active === "faq" ? (
          product.faq && product.faq.length > 0 ? (
            <dl className="space-y-4">
              {product.faq.map((entry) => (
                <div key={entry.question}>
                  <dt className="font-medium text-ink">{entry.question}</dt>
                  <dd className="text-muted">{entry.answer}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted">Sin preguntas frecuentes todavía.</p>
          )
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implementar `plan-picker.tsx`**

Crear `frontend/src/components/plan-picker.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CatalogProductDetail, PlanOffer } from "@/lib/catalog-client";
import { CART_MAX_QTY_PER_PLAN, type CartAddResult } from "@/lib/cart-logic";
import { useCart } from "@/lib/cart-context";
import { formatPriceCents } from "@/lib/format";
import { StockBadge } from "./stock-badge";

function planPriceCents(plan: PlanOffer): number {
  return plan.prices.find((p) => p.currency === "PEN")?.priceCents ?? 0;
}

export function PlanPicker({ product }: { product: CatalogProductDetail }) {
  const router = useRouter();
  const cart = useCart();

  const kinds = useMemo(() => {
    const present = new Set(product.plans.map((plan) => plan.kind));
    return Array.from(present);
  }, [product.plans]);

  const [kind, setKind] = useState<"NEW" | "RENEWAL">(kinds[0] ?? "NEW");
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  const plan = product.plans.find((p) => p.kind === kind) ?? product.plans[0];
  const outOfStock = !plan || plan.stockState === "OUT_OF_STOCK";

  function addCurrentPlan(): CartAddResult | null {
    if (!plan) return null;
    const result = cart.add(
      {
        planId: plan.id,
        productSlug: product.slug,
        productName: product.name,
        planName: plan.name,
        kind: plan.kind,
        unitPriceCents: planPriceCents(plan),
        requiresToolUsername: product.requiresToolUsername,
      },
      qty,
    );
    if (!result.ok) {
      setMessage(
        result.reason === "MAX_QTY"
          ? `Ya tienes el máximo de ${CART_MAX_QTY_PER_PLAN} unidades de este plan en el carrito`
          : "El carrito admite hasta 10 planes distintos",
      );
    } else {
      setMessage(null);
    }
    return result;
  }

  if (!plan) {
    return <p className="text-sm text-muted">Este producto no tiene planes disponibles.</p>;
  }

  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-5">
      {kinds.length > 1 ? (
        <div className="flex gap-2" role="group" aria-label="Tipo de activación">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-11 flex-1 rounded-[10px] border px-3 text-sm font-medium ${
                kind === k ? "border-accent bg-accent-soft-bg text-accent-soft-ink" : "border-line-strong text-muted"
              }`}
            >
              {k === "NEW" ? "Activación nueva" : "Renovación"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-2xl font-bold text-ink font-display">{formatPriceCents(planPriceCents(plan), "PEN")}</p>
        <StockBadge state={plan.stockState} />
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm font-medium text-ink">
        Cantidad
        <input
          type="number"
          min={1}
          max={CART_MAX_QTY_PER_PLAN}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
          disabled={outOfStock}
          className="h-11 w-20 rounded-[10px] border border-line-strong px-3"
        />
      </label>

      {message ? <p className="mt-2 text-sm text-danger-ink">{message}</p> : null}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={outOfStock}
          onClick={addCurrentPlan}
          className="flex h-11 items-center justify-center rounded-[10px] border border-line-strong text-sm font-medium text-ink disabled:opacity-50"
        >
          Añadir al carrito
        </button>
        <button
          type="button"
          disabled={outOfStock}
          onClick={() => {
            const result = addCurrentPlan();
            if (result?.ok) router.push("/checkout");
          }}
          className="flex h-11 items-center justify-center rounded-[10px] bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Comprar ahora
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/product-tabs.tsx frontend/src/components/plan-picker.tsx
git commit -m "Frontend: ProductTabs y PlanPicker para la ficha de producto"
```

---

### Task 10: `/p/[slug]/page.tsx` + enlazar el catálogo + `CartBadge`

**Files:**
- Create: `frontend/src/app/p/[slug]/page.tsx`
- Create: `frontend/src/components/cart-badge.tsx`
- Modify: `frontend/src/components/catalog-grid.tsx`
- Modify: `frontend/src/components/site-header.tsx`

**Interfaces:**
- Consumes: `fetchProductDetail` (Task 1), `ProductTabs`/`PlanPicker` (Task 9), `useCart` (Task 3), `SiteHeader`/`SiteFooter` (ya existen).
- Produces: ruta `/p/[slug]` navegable; `<CartBadge>` reusable (ya consumido por `site-header.tsx` en este mismo task).

- [ ] **Step 1: Implementar `cart-badge.tsx`**

Crear `frontend/src/components/cart-badge.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";

export function CartBadge() {
  const { itemCount } = useCart();

  return (
    <Link
      href="/checkout"
      className="relative flex h-11 items-center rounded-[10px] border border-line-strong px-4 text-sm font-medium text-ink"
      aria-label={itemCount > 0 ? `Carrito, ${itemCount} ítems` : "Carrito vacío"}
    >
      Carrito
      {itemCount > 0 ? (
        <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-medium text-white">
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
```

- [ ] **Step 2: Agregar `CartBadge` al header**

Modificar `frontend/src/components/site-header.tsx` — agregar el import y el componente junto a los otros links del grupo derecho:

```tsx
import Link from "next/link";
import { CartBadge } from "./cart-badge";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="bg-accent-soft-bg px-4 py-2 text-center text-sm text-accent-soft-ink">
        Entrega estimada: [N] min tras aprobar el pago · Soporte por WhatsApp: [wa.me/NÚMERO]
      </div>
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="font-display text-xl font-bold tracking-tight text-ink">
          Free Cell
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-muted">
          <Link href="/" className="text-ink">
            Catálogo
          </Link>
          <Link href="/pedidos">Mis pedidos</Link>
          <Link href="/tickets">Soporte</Link>
        </nav>
        <div className="flex items-center gap-3">
          <CartBadge />
          <Link
            href="/ingresar"
            className="flex h-11 items-center rounded-[10px] border border-line-strong px-4 text-sm font-medium text-ink"
          >
            Ingresar
          </Link>
          <Link
            href="/registro"
            className="flex h-11 items-center rounded-[10px] bg-ink px-4 text-sm font-medium text-white"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </header>
  );
}
```

(Los links `/ingresar`, `/registro`, `/pedidos`, `/tickets` ya eran placeholders sin ruta real antes de este plan — quedan fuera de alcance, no se tocan.)

- [ ] **Step 3: Enlazar las tarjetas del catálogo a `/p/[slug]`**

Modificar `frontend/src/components/catalog-grid.tsx` — envolver `<ProductCard>` en un `<Link>`:

```tsx
import Link from "next/link";
import type { CatalogCategory, CatalogProductListItem, CatalogSort } from "@/lib/catalog-client";
import { ProductCard } from "./product-card";
import { SortSelect } from "./sort-select";

// ... (buildCategoryHref sin cambios)

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
      {/* ... cabecera y filtros sin cambios ... */}

      {products.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Sin resultados para este filtro por ahora.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {total === 1 ? "1 herramienta disponible" : `${total} herramientas disponibles`}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Link key={product.id} href={`/p/${product.slug}`} className="block">
                <ProductCard product={product} />
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
```

(Solo cambia el `import` de `Link` y el `.map` final — el resto del archivo, incluida `buildCategoryHref` y la cabecera con filtros, queda igual.)

- [ ] **Step 4: Implementar `/p/[slug]/page.tsx`**

Crear `frontend/src/app/p/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PlanPicker } from "@/components/plan-picker";
import { ProductTabs } from "@/components/product-tabs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { fetchProductDetail } from "@/lib/catalog-client";

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const product = await fetchProductDetail(slug);

  if (!product) {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-6 py-10">
          <p className="text-xs font-medium text-muted">{product.categoryName ?? "Sin categoría"}</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-ink">{product.name}</h1>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
            <ProductTabs product={product} />
            <PlanPicker product={product} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 5: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Probar manualmente**

Run: `cd backend && npm run start:dev` (en una terminal) y `cd frontend && npm run dev -- --port 3001` (en otra).
Visitar `http://localhost:3001/p/producto-demo` (slug del seed). Verificar: pestañas cambian de contenido, toggle NEW/RENEWAL si el producto tiene ambos, "Añadir al carrito" no navega, "Comprar ahora" navega a `/checkout` con el ítem ya en el carrito (badge del header muestra el contador).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/p frontend/src/components/cart-badge.tsx frontend/src/components/catalog-grid.tsx frontend/src/components/site-header.tsx
git commit -m "Frontend: ficha de producto /p/[slug], CartBadge en el header, catalogo enlaza a producto"
```

---

### Task 11: Proteger `/checkout` en `proxy.ts`

**Files:**
- Modify: `frontend/src/proxy.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: el middleware redirige a `/login?callbackUrl=/checkout...` si no hay sesión, antes de que la página de checkout siquiera se renderice — así las páginas de checkout (Tasks 12–14) no necesitan repetir esa lógica.

- [ ] **Step 1: Implementar**

Modificar `frontend/src/proxy.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const ADMIN_PREFIX = "/admin";
const PROTECTED_PREFIXES = ["/cuenta", "/checkout", ADMIN_PREFIX];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) {
    return NextResponse.next();
  }

  const session = req.auth;
  if (!session || session.error) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith(ADMIN_PREFIX) && session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/cuenta/:path*", "/checkout/:path*"],
};
```

(Dos cambios: `"/checkout"` en `PROTECTED_PREFIXES` y `"/checkout/:path*"` en `matcher`.)

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Probar manualmente**

Sin sesión, visitar `http://localhost:3001/checkout` directamente → debe redirigir a `/login?callbackUrl=%2Fcheckout`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/proxy.ts
git commit -m "Frontend: proteger /checkout detras de sesion (proxy)"
```

---

### Task 12: `/checkout/page.tsx` — Resumen

**Files:**
- Create: `frontend/src/components/checkout-summary.tsx`
- Create: `frontend/src/app/checkout/page.tsx`

**Interfaces:**
- Consumes: `useCart` (Task 3), `createOrder`/`resendVerificationEmail` de `@/lib/orders-client` (Task 8), `saveOrderMeta` de `@/lib/order-meta` (Task 7), `formatPriceCents` (ya existe).
- Produces: ruta `/checkout` navegable; al confirmar, crea el pedido real y redirige a `/checkout/[orderId]/pago`.

- [ ] **Step 1: Implementar `checkout-summary.tsx`**

Crear `frontend/src/components/checkout-summary.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { formatPriceCents } from "@/lib/format";
import { saveOrderMeta } from "@/lib/order-meta";
import { createOrder, resendVerificationEmail } from "@/lib/orders-client";

export function CheckoutSummary() {
  const router = useRouter();
  const cart = useCart();
  const [toolUsername, setToolUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    setError(null);
    setNeedsVerification(false);
    if (cart.requiresToolUsername && toolUsername.trim().length === 0) {
      setError("Ingresa tu usuario de la herramienta para continuar");
      return;
    }

    setSubmitting(true);
    const result = await createOrder(
      cart.items.map((item) => ({ planId: item.planId, qty: item.qty })),
      cart.requiresToolUsername ? toolUsername.trim() : undefined,
    );
    setSubmitting(false);

    if (!result.ok) {
      if (result.status === 403) {
        setNeedsVerification(true);
      }
      setError(result.message);
      return;
    }

    saveOrderMeta(result.data.id, cart.items);
    cart.clear();
    router.push(`/checkout/${result.data.id}/pago`);
  }

  async function handleResend() {
    const result = await resendVerificationEmail();
    setResendSent(result.ok);
  }

  if (cart.items.length === 0) {
    return (
      <p className="text-sm text-muted">
        Tu carrito está vacío. <a href="/" className="text-accent underline">Vuelve al catálogo</a>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
        {cart.items.map((item) => (
          <li key={item.planId} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-ink">{item.productName}</p>
              <p className="text-sm text-muted">
                {item.planName} · {item.qty} {item.qty === 1 ? "unidad" : "unidades"}
              </p>
            </div>
            <p className="font-medium text-ink">{formatPriceCents(item.unitPriceCents * item.qty, "PEN")}</p>
          </li>
        ))}
      </ul>

      <p className="text-right text-lg font-bold text-ink font-display">
        Total: {formatPriceCents(cart.totalCents, "PEN")}
      </p>

      {cart.requiresToolUsername ? (
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Usuario de la herramienta
          <input
            type="text"
            value={toolUsername}
            onChange={(e) => setToolUsername(e.target.value)}
            className="h-11 rounded-[10px] border border-line-strong px-3"
            required
          />
        </label>
      ) : null}

      {error ? (
        <div className="rounded-[10px] bg-danger-bg p-3 text-sm text-danger-ink">
          <p>{error}</p>
          {needsVerification ? (
            <button
              type="button"
              onClick={handleResend}
              className="mt-2 font-medium underline disabled:opacity-50"
              disabled={resendSent}
            >
              {resendSent ? "Enlace reenviado, revisa tu correo" : "Reenviar enlace de verificación"}
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleContinue}
        disabled={submitting}
        className="flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Reservando…" : "Continuar a pago"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Implementar `/checkout/page.tsx`**

Crear `frontend/src/app/checkout/page.tsx`:

```tsx
import { CheckoutSummary } from "@/components/checkout-summary";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[640px] px-6 py-10">
          <h1 className="font-display text-2xl font-bold text-ink">Resumen de tu pedido</h1>
          <div className="mt-6">
            <CheckoutSummary />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Probar manualmente**

Con sesión iniciada y un ítem en el carrito (Task 10), ir a `/checkout`, confirmar: aparece el ítem, el total es correcto, "Continuar a pago" crea el pedido y redirige a `/checkout/<id>/pago` (aunque esa página aún no exista hasta la Task 13 — un 404 temporal ahí es esperado en este punto).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/checkout-summary.tsx frontend/src/app/checkout/page.tsx
git commit -m "Frontend: paso Resumen del checkout (crea el pedido real)"
```

---

### Task 13: `/checkout/[orderId]/pago/page.tsx`

**Files:**
- Create: `frontend/src/components/payment-form.tsx`
- Create: `frontend/src/app/checkout/[orderId]/pago/page.tsx`

**Interfaces:**
- Consumes: `getOrder`/`requestPaymentUploadUrl`/`submitPayment` de `@/lib/orders-client` (Task 8), `computeProofHash` (Task 4), `Countdown` (Task 6), `fetchPaymentMethods` de `@/lib/catalog-client` (ya existe), `readOrderMeta` de `@/lib/order-meta` (Task 7).
- Produces: ruta `/checkout/[orderId]/pago`; al confirmar el pago, redirige a `/checkout/[orderId]/entrega`.

- [ ] **Step 1: Implementar `payment-form.tsx`**

Crear `frontend/src/components/payment-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Countdown } from "@/components/countdown";
import type { PaymentMethod } from "@/lib/catalog-client";
import { computeProofHash } from "@/lib/proof-hash";
import { requestPaymentUploadUrl, submitPayment } from "@/lib/orders-client";

const ALLOWED_TYPES: Record<string, true> = {
  "image/jpeg": true,
  "image/png": true,
  "application/pdf": true,
};
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function PaymentForm({
  orderId,
  expiresAt,
  paymentMethods,
}: {
  orderId: string;
  expiresAt: string;
  paymentMethods: PaymentMethod[];
}) {
  const router = useRouter();
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [operationNumber, setOperationNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [acceptsLegalDeclaration, setAcceptsLegalDeclaration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  function handleFileChange(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES[selected.type]) {
      setError("El comprobante debe ser JPG, PNG o PDF");
      return;
    }
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError("El comprobante no puede superar 5 MB");
      return;
    }
    setFile(selected);
  }

  async function handleSubmit() {
    if (!file) {
      setError("Sube el comprobante de pago");
      return;
    }
    if (!acceptsLegalDeclaration) {
      setError("Debes aceptar la declaración de titularidad/autorización");
      return;
    }
    if (operationNumber.trim().length === 0) {
      setError("Ingresa el número de operación");
      return;
    }

    setSubmitting(true);
    setError(null);

    const uploadUrlResult = await requestPaymentUploadUrl(
      orderId,
      file.type as "image/jpeg" | "image/png" | "application/pdf",
      file.size,
    );
    if (!uploadUrlResult.ok) {
      setError(uploadUrlResult.message);
      setSubmitting(false);
      return;
    }

    const { uploadUrl, proofKey } = uploadUrlResult.data;
    const [uploadRes, proofHash] = await Promise.all([
      fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }),
      computeProofHash(file),
    ]);
    if (!uploadRes.ok) {
      setError("No pudimos subir el comprobante, intenta de nuevo");
      setSubmitting(false);
      return;
    }

    const paymentResult = await submitPayment(orderId, {
      paymentMethodId,
      proofKey,
      proofHash,
      operationNumber: operationNumber.trim(),
      acceptsLegalDeclaration,
    });
    setSubmitting(false);

    if (!paymentResult.ok) {
      setError(paymentResult.message);
      return;
    }

    router.push(`/checkout/${orderId}/entrega`);
  }

  return (
    <div className="flex flex-col gap-6">
      <Countdown expiresAt={expiresAt} onExpire={() => setExpired(true)} />

      {expired ? (
        <div className="rounded-[10px] bg-danger-bg p-4 text-sm text-danger-ink">
          <p>La reserva de este pedido venció. Vuelve al catálogo para armar el pedido de nuevo.</p>
          <a href="/checkout" className="mt-2 inline-block font-medium underline">
            Volver al carrito
          </a>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Método de pago
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="h-11 rounded-[10px] border border-line-strong px-3"
            >
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            N.º de operación
            <input
              type="text"
              value={operationNumber}
              onChange={(e) => setOperationNumber(e.target.value)}
              className="h-11 rounded-[10px] border border-line-strong px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Comprobante (JPG, PNG o PDF, máx. 5 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="rounded-[10px] border border-line-strong px-3 py-2"
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={acceptsLegalDeclaration}
              onChange={(e) => setAcceptsLegalDeclaration(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            Declaro ser propietario o técnico autorizado del equipo donde se usará esta licencia.
          </label>

          {error ? <p className="text-sm text-danger-ink">{error}</p> : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Confirmar pago"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implementar `/checkout/[orderId]/pago/page.tsx`**

Crear `frontend/src/app/checkout/[orderId]/pago/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PaymentForm } from "@/components/payment-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { fetchPaymentMethods } from "@/lib/catalog-client";
import { getOrder } from "@/lib/orders-client";

export default async function PaymentPage({ params }: PageProps<"/checkout/[orderId]/pago">) {
  const { orderId } = await params;
  const [orderResult, paymentMethods] = await Promise.all([getOrder(orderId), fetchPaymentMethods()]);

  if (!orderResult.ok) {
    notFound();
  }
  if (orderResult.data.status !== "PENDING_PAYMENT") {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[640px] px-6 py-10">
          <h1 className="font-display text-2xl font-bold text-ink">Pago del pedido #{orderResult.data.orderNumber}</h1>
          <div className="mt-6">
            <PaymentForm
              orderId={orderResult.data.id}
              expiresAt={orderResult.data.expiresAt}
              paymentMethods={paymentMethods.filter((method) => method.active && method.currencies.includes("PEN"))}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Probar manualmente**

Completar el flujo desde `/p/producto-demo` → `/checkout` → `/checkout/<id>/pago`: elegir método, número de operación, subir una imagen de prueba, aceptar la declaración, confirmar. Verificar que redirige a `/checkout/<id>/entrega` (404 esperado todavía — es la Task 14).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/payment-form.tsx frontend/src/app/checkout/\[orderId\]/pago
git commit -m "Frontend: paso Pago del checkout (comprobante, declaracion legal, countdown)"
```

---

### Task 14: `/checkout/[orderId]/entrega/page.tsx`

**Files:**
- Create: `frontend/src/app/checkout/[orderId]/entrega/page.tsx`

**Interfaces:**
- Consumes: `getOrder` de `@/lib/orders-client` (Task 8).
- Produces: ruta `/checkout/[orderId]/entrega`, pantalla final del flujo de este plan.

- [ ] **Step 1: Implementar**

Crear `frontend/src/app/checkout/[orderId]/entrega/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getOrder } from "@/lib/orders-client";

export default async function DeliveryPage({ params }: PageProps<"/checkout/[orderId]/entrega">) {
  const { orderId } = await params;
  const result = await getOrder(orderId);

  if (!result.ok) {
    notFound();
  }

  const order = result.data;

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-6 py-16 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">¡Comprobante recibido!</h1>
          <p className="text-muted">
            Pedido #{order.orderNumber} en revisión. Te avisamos en cuanto aprobemos tu pago (hasta 24 horas,
            normalmente antes).
          </p>
          <a
            href="/"
            className="mt-2 flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Volver al catálogo
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Probar manualmente**

Repetir el flujo completo desde `/p/producto-demo`; al confirmar el pago debe llegar a esta pantalla mostrando el número de pedido correcto.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/checkout/\[orderId\]/entrega
git commit -m "Frontend: paso Entrega del checkout (confirmacion IN_REVIEW)"
```

---

### Task 15: E2E Playwright — flujo feliz + reserva vencida

**Files:**
- Modify: `frontend/package.json` (agrega `pg` como devDependency)
- Create: `frontend/e2e/db.ts`
- Create: `frontend/e2e/checkout.spec.ts`

**Interfaces:**
- Consumes: el flujo completo construido en las Tasks 1–14; `DATABASE_URL` de `backend/.env` (ya cargado por `e2e/global-setup.ts` vía `dotenv`).
- Produces: dos pruebas e2e nuevas.

> El seed del backend (`backend/src/database/seed.ts`) crea un plan demo (`[Plan demo]`, slug `producto-demo`) con **solo 5 licencias** fijas. Para no agotarlas en corridas repetidas, el test feliz **cancela** el pedido al final (`POST /orders/:id/cancel` libera la reserva — regla de dominio ya implementada). El test de "reserva vencida" no reserva stock real (ver Step 3): usa un pedido creado y cuya expiración se fuerza hacia atrás directamente en la base, no una espera de 30 minutos.

- [ ] **Step 1: Agregar `pg` como devDependency**

Run: `cd frontend && npm install -D pg @types/pg`

- [ ] **Step 2: Crear el helper de base de datos para el e2e**

Crear `frontend/e2e/db.ts`:

```ts
import { Client } from "pg";

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function markEmailVerified(email: string): Promise<void> {
  await withClient((client) =>
    client.query(`UPDATE users SET "emailVerifiedAt" = now() WHERE email = $1`, [email.toLowerCase()]),
  );
}

export async function expireOrderNow(orderId: string): Promise<void> {
  await withClient((client) =>
    client.query(`UPDATE orders SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [orderId]),
  );
}
```

- [ ] **Step 3: Escribir el test (sin implementación todavía — este paso solo confirma que falla por falta de datos de prueba, no por un bug de compilación)**

Crear `frontend/e2e/checkout.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { expireOrderNow, markEmailVerified } from "./db";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function registerAndLogin(page: import("@playwright/test").Page) {
  const email = `e2e-checkout-${Date.now()}@freecell.test`;
  const password = "Contrasena#123";

  const registerRes = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name: "Cliente Checkout E2E" },
  });
  expect(registerRes.ok()).toBeTruthy();
  await markEmailVerified(email);

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
}

test("flujo feliz: producto -> carrito -> checkout -> pago -> entrega", async ({ page }) => {
  await registerAndLogin(page);

  // Intercepta la subida directa a R2: en este entorno de e2e no se valida contenido real,
  // solo que el frontend hace el PUT con el Content-Type correcto.
  await page.route("**/*.r2.cloudflarestorage.com/**", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );

  await page.goto("/p/producto-demo");
  await page.getByRole("button", { name: "Comprar ahora" }).click();

  await expect(page).toHaveURL("/checkout");
  await expect(page.getByText("[Plan demo]")).toBeVisible();
  await page.getByRole("button", { name: "Continuar a pago" }).click();

  await expect(page).toHaveURL(/\/checkout\/.+\/pago/);
  await expect(page.getByText(/Reserva vigente/)).toBeVisible();

  await page.getByLabel("N.º de operación").fill(`OP-${Date.now()}`);
  const fileInput = page.getByLabel(/Comprobante/);
  await fileInput.setInputFiles({
    name: "comprobante.png",
    mimeType: "image/png",
    buffer: Buffer.from("comprobante-e2e"),
  });
  await page.getByLabel(/Declaro ser propietario/).check();
  await page.getByRole("button", { name: "Confirmar pago" }).click();

  await expect(page).toHaveURL(/\/checkout\/.+\/entrega/);
  await expect(page.getByText("¡Comprobante recibido!")).toBeVisible();

  const orderId = page.url().match(/\/checkout\/([^/]+)\/entrega/)?.[1];
  expect(orderId).toBeTruthy();
  const session = await (await page.request.get("/api/auth/session")).json();
  await page.request.post(`${API_URL}/orders/${orderId}/cancel`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
});

test("reserva vencida bloquea la subida del comprobante", async ({ page }) => {
  await registerAndLogin(page);

  await page.goto("/p/producto-demo");
  await page.getByRole("button", { name: "Comprar ahora" }).click();
  await page.getByRole("button", { name: "Continuar a pago" }).click();
  await expect(page).toHaveURL(/\/checkout\/.+\/pago/);

  const orderId = page.url().match(/\/checkout\/([^/]+)\/pago/)?.[1];
  expect(orderId).toBeTruthy();
  await expireOrderNow(orderId!);

  await page.reload();
  await expect(page.getByText("Reserva vencida")).toBeVisible();
  await expect(page.getByLabel(/Comprobante/)).toHaveCount(0);

  const session = await (await page.request.get("/api/auth/session")).json();
  await page.request.post(`${API_URL}/orders/${orderId}/cancel`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
});
```

- [ ] **Step 4: Correr el test y verificar que falla (o pasa) según el estado real del backend dev**

Run: `cd backend && npm run start:dev` (otra terminal), luego `cd frontend && npm run test:e2e -- checkout.spec.ts`
Expected en este punto (plan ya implementado hasta Task 14): debería **pasar**. Si falla, revisar en orden: ¿`backend/.env` tiene credenciales R2 reales? (no debería importar, el `page.route` intercepta antes de llegar a la red real) ¿el seed corrió (`npm run seed` en `backend/`) y existe el producto `producto-demo` con stock? ¿`DATABASE_URL` en `backend/.env` apunta a la base de dev, no a `licencias_test`?

- [ ] **Step 5: Ajustar hasta que pase**

(No hay "implementación" nueva que escribir aquí — este test ejercita todo lo ya construido en las Tasks 1–14. Si falla, el bug está en alguna de esas tasks, no en el test.)

Run: `cd frontend && npm run test:e2e -- checkout.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/e2e/db.ts frontend/e2e/checkout.spec.ts
git commit -m "Frontend: e2e del checkout completo (flujo feliz + reserva vencida)"
```

---

### Task 16: Actualizar documentación de cierre

**Files:**
- Modify: `docs/02-requerimientos-funcionales.md`
- Modify: `docs/10-orden-de-ejecucion.md`

**Interfaces:** ninguna (solo documentación).

- [ ] **Step 1: Actualizar RF-COM-03**

En `docs/02-requerimientos-funcionales.md`, en la fila de `RF-COM-03`, cambiar el estado 🟡 a ✅ y anotar la fecha y la salvedad de moneda:

```
| RF-COM-03 | El checkout muestra resumen (con todos los ítems del carrito), cuenta regresiva de la reserva e instrucciones de pago (métodos de pago configurables: billeteras, transferencia y cripto en USDT para pedidos en USD, D63). | M | ✅ (2026-11-03, frontend fijo en PEN; selector de moneda y métodos CRYPTO llegan con esa mejora posterior) |
```

(Buscar la fila exacta por el texto `RF-COM-03` antes de reemplazar — no asumir el número de línea.)

- [ ] **Step 2: Cerrar el paso 3 del roadmap**

En `docs/10-orden-de-ejecucion.md`, cambiar la fila `| 3 | Frontend: página producto...` para marcarla ✅, y actualizar la sección "Estado" al final del archivo:

```
| 3 | ✅ Frontend: página producto (`/p/[slug]`) + carrito + checkout (S2/S3) — 2026-11-03 | El flujo de compra en sí. Backend (`/orders`, `/orders/:id/payment*`) ya está completo para esto. |
```

Y al final del archivo:

```
## Estado (2026-11-03)

Paso 1 completo (`/admin/payments`: list/approve/reject, migración `AdminPaymentFunctions`, 15 pruebas e2e).
Paso 2 completo (catálogo del frontend conectado a la API real — 2026-11-02).
Paso 3 completo (página producto, carrito y checkout de 3 pasos — 2026-11-03).
Próximo: **paso 4** (panel admin de pagos, S6).
```

- [ ] **Step 3: Commit**

```bash
git add docs/02-requerimientos-funcionales.md docs/10-orden-de-ejecucion.md
git commit -m "Docs: cierre del paso 3 (producto/carrito/checkout) en RF-COM-03 y orden de ejecucion"
```

---

## Self-Review

**Cobertura del spec:** carrito client-side (Tasks 2–3), login diferido hasta `/checkout` (Task 11), moneda fija PEN (Task 8, `createOrder` hardcodea `"PEN"`), 3 rutas de checkout (Tasks 12–14), manejo de errores por código (Task 8 `callBackend` + cada formulario), hash SHA-256 en cliente (Task 4), countdown con bloqueo al vencer (Tasks 5–6, 13), declaración legal obligatoria (Task 13), testing unitario/integración/e2e (Tasks 1–2, 4–5, 8, 15). Todo lo listado en "Fuera de alcance" del spec (selector de moneda, Mis pedidos, panel admin de pagos, reintento de pago) no tiene tareas aquí — correcto.

**Placeholders:** ninguno — cada step tiene código completo, sin "TBD" ni "similar a la Task N" sin repetir el código.

**Consistencia de tipos:** `OrderView`/`OrdersActionResult<T>` (Task 8) se usan igual en Tasks 12–14; `CartItem` (Task 2) es el mismo tipo consumido por `cart-context.tsx` (Task 3), `plan-picker.tsx` (Task 9) y `order-meta.ts` (Task 7); `PlanOffer`/`CatalogProductDetail` (Task 1) se consumen igual en Tasks 9–10. `CART_MAX_QTY_PER_PLAN`/`CART_MAX_DISTINCT_PLANS` (Task 2) son los mismos valores que los límites del backend (`qty` 1–5, 10 planes distintos) — confirmado contra `backend/src/orders/dto/create-order.dto.ts`.

**Gap encontrado y resuelto durante la escritura de este plan:** `OrderResponseDto` del backend no devuelve nombres de producto/plan (solo `planId`), así que sin la Task 7 (`order-meta.ts`) las pantallas de pago/entrega no podrían mostrar "qué" compró el cliente. Se agregó esa task con una caché de solo-lectura en `localStorage`, sin tocar el contrato del backend.
