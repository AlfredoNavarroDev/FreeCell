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
