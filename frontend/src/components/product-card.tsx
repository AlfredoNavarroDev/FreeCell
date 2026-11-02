import type { CatalogProductListItem } from "@/lib/catalog-client";
import { formatPriceCents } from "@/lib/format";
import { StockBadge } from "./stock-badge";

export function ProductCard({ product }: { product: CatalogProductListItem }) {
  return (
    <article className="flex flex-col rounded-2xl border border-line-soft bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-muted">{product.categoryName ?? "Sin categoría"}</p>
          <h3 className="font-display mt-0.5 text-lg font-bold text-ink">{product.name}</h3>
        </div>
        <StockBadge state={product.stockState} />
      </div>

      <p className="mt-4 text-sm text-muted">
        Desde{" "}
        <span className="font-medium text-ink">
          {formatPriceCents(product.priceFromCents, product.currency)}
        </span>
      </p>
    </article>
  );
}
