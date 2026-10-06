// Datos de ejemplo para S1 (Catálogo) mientras no hay conexión a la API (Sprint 2).
// Placeholders entre corchetes por convención del proyecto (ver docs/07-diseno-ui.md):
// no se inventan nombres, precios ni proveedores reales de negocio.

export type StockState = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export const STOCK_LABEL: Record<StockState, string> = {
  IN_STOCK: "En stock",
  LOW_STOCK: "Pocas unidades",
  OUT_OF_STOCK: "Agotado",
};

export interface CatalogPlan {
  id: string;
  name: string;
  durationDays: number;
  priceCents: number;
  currency: "PEN";
  stockState: StockState;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  plans: CatalogPlan[];
}

export const CATEGORIES = ["Todas", "[Categoría 1]", "[Categoría 2]", "[Categoría 3]"] as const;

export const MOCK_CATALOG: CatalogProduct[] = [
  {
    id: "p1",
    slug: "producto-1",
    name: "[Producto 1]",
    category: "[Categoría 1]",
    description: "[Descripción corta del producto 1]",
    plans: [
      { id: "p1-30", name: "30 días", durationDays: 30, priceCents: 0, currency: "PEN", stockState: "IN_STOCK" },
      { id: "p1-90", name: "90 días", durationDays: 90, priceCents: 0, currency: "PEN", stockState: "LOW_STOCK" },
      { id: "p1-365", name: "365 días", durationDays: 365, priceCents: 0, currency: "PEN", stockState: "OUT_OF_STOCK" },
    ],
  },
  {
    id: "p2",
    slug: "producto-2",
    name: "[Producto 2]",
    category: "[Categoría 2]",
    description: "[Descripción corta del producto 2]",
    plans: [
      { id: "p2-30", name: "30 días", durationDays: 30, priceCents: 0, currency: "PEN", stockState: "IN_STOCK" },
      { id: "p2-90", name: "90 días", durationDays: 90, priceCents: 0, currency: "PEN", stockState: "IN_STOCK" },
      { id: "p2-365", name: "365 días", durationDays: 365, priceCents: 0, currency: "PEN", stockState: "LOW_STOCK" },
    ],
  },
  {
    id: "p3",
    slug: "producto-3",
    name: "[Producto 3]",
    category: "[Categoría 3]",
    description: "[Descripción corta del producto 3]",
    plans: [
      { id: "p3-30", name: "30 días", durationDays: 30, priceCents: 0, currency: "PEN", stockState: "LOW_STOCK" },
      { id: "p3-90", name: "90 días", durationDays: 90, priceCents: 0, currency: "PEN", stockState: "IN_STOCK" },
      { id: "p3-365", name: "365 días", durationDays: 365, priceCents: 0, currency: "PEN", stockState: "IN_STOCK" },
    ],
  },
  {
    id: "p4",
    slug: "producto-4",
    name: "[Producto 4]",
    category: "[Categoría 1]",
    description: "[Descripción corta del producto 4]",
    plans: [
      { id: "p4-30", name: "30 días", durationDays: 30, priceCents: 0, currency: "PEN", stockState: "OUT_OF_STOCK" },
      { id: "p4-90", name: "90 días", durationDays: 90, priceCents: 0, currency: "PEN", stockState: "OUT_OF_STOCK" },
      { id: "p4-365", name: "365 días", durationDays: 365, priceCents: 0, currency: "PEN", stockState: "LOW_STOCK" },
    ],
  },
];

export function formatPriceCents(cents: number): string {
  if (cents === 0) return "S/ [PRECIO]";
  return `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
}
