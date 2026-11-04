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
