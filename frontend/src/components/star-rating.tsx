import { formatRating } from "@/lib/rating";

export function StarRating({ value, count }: { value: number; count?: number }) {
  const full = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true" className="text-ink">
        {"★".repeat(full)}
        {"☆".repeat(5 - full)}
      </span>
      <span className="font-medium text-ink">{formatRating(value)} de 5</span>
      {count !== undefined ? <span className="text-muted">({count})</span> : null}
    </span>
  );
}
