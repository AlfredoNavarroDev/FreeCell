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
