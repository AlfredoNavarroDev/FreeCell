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
    // Clamp qty to valid range; qty must stay in [1, CART_MAX_QTY_PER_PLAN]
    const nextQty = Math.max(1, Math.min(existing.qty + qty, CART_MAX_QTY_PER_PLAN));

    // If qty is 0, nextQty equals existing.qty and we're doing a no-op, so succeed without change
    if (qty === 0) {
      return { ok: true, items };
    }

    // If nextQty didn't change from existing.qty, we've hit the upper limit
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
