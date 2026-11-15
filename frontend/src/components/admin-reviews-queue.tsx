"use client";

import { useState } from "react";
import { StarRating } from "@/components/star-rating";
import {
  approveReview,
  fetchAdminReviews,
  hideReview,
  type AdminReviewView,
} from "@/lib/reviews-admin-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { dateStyle: "medium", timeZone: "America/Lima" });
}

export function AdminReviewsQueue({ initialReviews }: { initialReviews: AdminReviewView[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [selectedId, setSelectedId] = useState<string | null>(initialReviews[0]?.reviewId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = reviews.find((r) => r.reviewId === selectedId) ?? null;

  async function refetchQueue(): Promise<AdminReviewView[]> {
    const result = await fetchAdminReviews("PENDING");
    if (!result.ok) {
      setError(result.message);
      return reviews;
    }
    setReviews(result.data.items);
    return result.data.items;
  }

  async function act(kind: "approve" | "hide") {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const result = await (kind === "approve" ? approveReview : hideReview)(selected.reviewId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      await refetchQueue();
      return;
    }
    const fresh = await refetchQueue();
    setSelectedId(fresh[0]?.reviewId ?? null);
    setMessage(
      kind === "approve"
        ? `Reseña de ${selected.productName} aprobada y publicada.`
        : `Reseña de ${selected.productName} oculta.`,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}
      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-line-soft bg-surface p-14 text-center">
          <p className="font-display text-xl font-bold text-ink">Sin reseñas pendientes</p>
          <p className="mt-1 text-muted">Cuando un cliente valore una compra, aparecerá aquí para moderarla.</p>
        </div>
      ) : (
        <>
          <p className="text-muted">{reviews.length} pendientes</p>
          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Cola de reseñas" className="flex w-full max-w-[360px] flex-col gap-2">
              {reviews.map((r) => {
                const active = r.reviewId === selectedId;
                return (
                  <button
                    key={r.reviewId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(r.reviewId);
                      setError(null);
                      setMessage(null);
                    }}
                    className={`flex min-h-11 flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left ${
                      active ? "border-accent bg-accent-soft-bg" : "border-line-soft bg-surface"
                    }`}
                  >
                    <span className="font-semibold text-ink">{r.productName}</span>
                    <StarRating value={r.rating} />
                    <span className="text-sm text-muted">{r.customerName ?? r.customerEmail}</span>
                  </button>
                );
              })}
            </section>
            {selected ? (
              <section
                key={selected.reviewId}
                aria-label="Detalle de la reseña"
                className="flex-1 rounded-2xl border border-line-soft bg-surface p-6"
              >
                <div className="mb-4">
                  <p className="font-display text-xl font-bold text-ink">{selected.productName}</p>
                  <p className="text-sm text-muted">
                    {selected.customerName ?? selected.customerEmail} · Pedido #{selected.orderNumber} ·{" "}
                    {formatDate(selected.createdAt)}
                  </p>
                </div>
                <div className="mb-4">
                  <StarRating value={selected.rating} />
                </div>
                <div className="mb-5 rounded-[10px] bg-bg px-4 py-3">
                  <p className="text-sm text-muted">Lo que escribió el cliente</p>
                  <p className="whitespace-pre-line text-ink">{selected.body}</p>
                </div>
                <div className="flex flex-wrap gap-3 border-t border-line-soft pt-5">
                  <button
                    type="button"
                    onClick={() => act("approve")}
                    disabled={submitting}
                    className="flex h-12 flex-1 items-center justify-center rounded-[10px] bg-success-ink px-6 text-base font-semibold text-white disabled:opacity-50"
                  >
                    Aprobar y publicar
                  </button>
                  <button
                    type="button"
                    onClick={() => act("hide")}
                    disabled={submitting}
                    className="flex h-12 items-center justify-center rounded-[10px] border border-danger-ink px-6 text-base font-semibold text-danger-ink disabled:opacity-50"
                  >
                    Ocultar
                  </button>
                </div>
                <p className="mt-3 text-sm text-muted">
                  Una reseña oculta no se muestra al público ni cuenta en el promedio.
                </p>
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
