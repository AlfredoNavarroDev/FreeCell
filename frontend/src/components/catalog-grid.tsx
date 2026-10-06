"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, MOCK_CATALOG } from "@/lib/mock-catalog";
import { ProductCard } from "./product-card";

export function CatalogGrid() {
  const [category, setCategory] = useState<string>("Todas");

  const filtered = useMemo(
    () =>
      category === "Todas"
        ? MOCK_CATALOG
        : MOCK_CATALOG.filter((p) => p.category === category),
    [category]
  );

  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold text-ink">Catálogo</h2>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
        {CATEGORIES.map((cat) => {
          const active = cat === category;
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(cat)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                active
                  ? "border-accent bg-accent-soft-bg text-accent-soft-ink"
                  : "border-line-strong text-muted"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          Sin resultados para esta categoría por ahora.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
