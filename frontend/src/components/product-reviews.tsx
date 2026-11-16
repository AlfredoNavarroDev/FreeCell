"use client";

import { useState } from "react";
import { StarRating } from "@/components/star-rating";
import { fetchProductReviews, type ProductReviewsPage } from "@/lib/reviews-public-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { dateStyle: "medium", timeZone: "America/Lima" });
}

export function ProductReviews({ slug, initial }: { slug: string; initial: ProductReviewsPage | null }) {
  const [items, setItems] = useState(initial?.items ?? []);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  if (!initial) {
    return <p className="text-muted">No pudimos cargar las reseñas. Intenta de nuevo en unos minutos.</p>;
  }

  async function handleLoadMore() {
    setLoading(true);
    setLoadFailed(false);
    const next = await fetchProductReviews(slug, page + 1);
    setLoading(false);
    if (!next) {
      setLoadFailed(true);
      return;
    }
    setItems((prev) => [...prev, ...next.items.filter((n) => !prev.some((p) => p.id === n.id))]);
    setPage(next.page);
  }

  if (initial.ratingCount === 0) {
    return <p className="text-muted">Todavía no hay reseñas.</p>;
  }

  return (
    <div className="space-y-4">
      {initial.ratingAvg !== null ? <StarRating value={initial.ratingAvg} count={initial.ratingCount} /> : null}
      <ul className="space-y-4">
        {items.map((review) => (
          <li key={review.id} className="rounded-xl border border-line-soft bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StarRating value={review.rating} />
              <span className="text-xs text-muted">{formatDate(review.createdAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-ink">{review.body}</p>
            <p className="mt-2 text-xs text-muted">{review.authorName} · Compra verificada</p>
          </li>
        ))}
      </ul>
      {loadFailed ? <p className="text-danger-ink">No pudimos cargar más reseñas.</p> : null}
      {items.length < initial.total ? (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loading}
          className="flex h-11 items-center rounded-[10px] border border-line-strong px-5 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {loading ? "Cargando…" : "Cargar más"}
        </button>
      ) : null}
    </div>
  );
}
