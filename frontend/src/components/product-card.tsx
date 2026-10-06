import Link from "next/link";
import { formatPriceCents, type CatalogProduct } from "@/lib/mock-catalog";
import { StockBadge } from "./stock-badge";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const cheapest = product.plans.reduce((min, p) =>
    p.priceCents < min.priceCents ? p : min
  );

  return (
    <article className="flex flex-col rounded-2xl border border-line-soft bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted">{product.category}</p>
          <h3 className="font-display mt-0.5 text-lg font-bold text-ink">
            {product.name}
          </h3>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">{product.description}</p>

      <ul className="mt-4 space-y-2">
        {product.plans.map((plan) => (
          <li
            key={plan.id}
            className="flex items-center justify-between rounded-[10px] border border-line px-3 py-2 text-sm"
          >
            <span className="font-medium text-ink">{plan.name}</span>
            <StockBadge state={plan.stockState} />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          Desde <span className="font-medium text-ink">{formatPriceCents(cheapest.priceCents)}</span>
        </p>
        <Link
          href={`/p/${product.slug}`}
          className="flex h-11 items-center rounded-[10px] bg-ink px-4 text-sm font-medium text-white"
        >
          Ver planes
        </Link>
      </div>
    </article>
  );
}
