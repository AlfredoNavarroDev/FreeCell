import type { Currency } from "./catalog-client";

const CURRENCY_SYMBOL: Record<Currency, string> = {
  PEN: "S/",
  USD: "$",
};

export function formatPriceCents(cents: number, currency: Currency = "PEN"): string {
  const amount = (cents / 100).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOL[currency]} ${amount}`;
}
