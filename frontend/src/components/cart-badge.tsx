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
