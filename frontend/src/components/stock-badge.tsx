import { STOCK_LABEL, type StockState } from "@/lib/mock-catalog";

const STYLES: Record<StockState, string> = {
  IN_STOCK: "bg-success-bg text-success-ink",
  LOW_STOCK: "bg-warning-bg text-warning-ink",
  OUT_OF_STOCK: "bg-danger-bg text-danger-ink",
};

export function StockBadge({ state }: { state: StockState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[state]}`}
    >
      {STOCK_LABEL[state]}
    </span>
  );
}
