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

  it("trata qty de 0 en plan existente como no-op exitoso (fix finding 2)", () => {
    // Test case: qty=0 on existing item NOT at limit should be success with unchanged items
    const existing: CartItem[] = [{ ...makeItem(), qty: 2 }];
    const result = addToCart(existing, makeItem(), 0);
    expect(result.ok).toBe(true);
    expect(result.items).toBe(existing); // No change
  });

  it("clampea qty negativo en plan existente al rango válido (fix finding 1)", () => {
    // Test case: negative qty should clamp to min of 1
    const existing: CartItem[] = [{ ...makeItem(), qty: 3 }];
    const result = addToCart(existing, makeItem(), -2);
    expect(result.ok).toBe(true);
    // 3 + (-2) = 1, which is within valid range [1, CART_MAX_QTY_PER_PLAN]
    expect(result.items[0].qty).toBe(1);
  });

  it("no confunde qty=0 con MAX_QTY cuando el plan no está en el límite", () => {
    // Regression test: ensure qty=0 doesn't falsely trigger MAX_QTY reason
    const existing: CartItem[] = [{ ...makeItem(), qty: 2 }];
    const result = addToCart(existing, makeItem(), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Should not have a MAX_QTY reason when qty=0
      expect(result.reason).not.toBe("MAX_QTY");
    }
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
