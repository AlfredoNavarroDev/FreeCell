import Link from "next/link";
import type { CatalogCategory, CatalogProductListItem, CatalogSort } from "@/lib/catalog-client";
import { ProductCard } from "./product-card";
import { SortSelect } from "./sort-select";

function buildCategoryHref(
  categoryId: string | undefined,
  current: { query?: string; sort?: CatalogSort },
): string {
  const params = new URLSearchParams();
  if (current.query) params.set("query", current.query);
  if (current.sort) params.set("sort", current.sort);
  if (categoryId) params.set("category", categoryId);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold text-ink">Catálogo</h2>
        <SortSelect value={selectedSort} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
        <Link
          href={buildCategoryHref(undefined, current)}
          aria-current={!selectedCategory ? "true" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${
            !selectedCategory ? "border-accent bg-accent-soft-bg text-accent-soft-ink" : "border-line-strong text-muted"
          }`}
        >
          Todas
        </Link>
        {categories.map((cat) => {
          const active = cat.id === selectedCategory;
          return (
            <Link
              key={cat.id}
              href={buildCategoryHref(cat.id, current)}
              aria-current={active ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${
                active ? "border-accent bg-accent-soft-bg text-accent-soft-ink" : "border-line-strong text-muted"
              }`}
            >
              {cat.name}
            </Link>
          );
        })}
      </div>

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
