"use client";

import { useEffect, useState } from "react";
import { formatPriceCents } from "@/lib/format";
import { readOrderMeta, type OrderMetaItem } from "@/lib/order-meta";

export function OrderItemsSummary({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<OrderMetaItem[]>([]);

  useEffect(() => {
    setItems(readOrderMeta(orderId));
  }, [orderId]);

  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
      {items.map((item) => (
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
  );
}
