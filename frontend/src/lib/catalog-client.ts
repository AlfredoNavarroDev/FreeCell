export type Currency = "PEN" | "USD";
export type StockState = "IN_STOCK" | "LOW" | "OUT_OF_STOCK";
export type CatalogSort = "price_asc" | "price_desc" | "newest";

export interface CatalogCategory {
  id: string;
  name: string;
}

export interface CatalogProductListItem {
  id: string;
  name: string;
  slug: string;
  categoryName: string | null;
  priceFromCents: number;
  currency: Currency;
  stockState: StockState;
}

export interface CatalogProductsResult {
  items: CatalogProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  kind: "WALLET" | "BANK_TRANSFER" | "CRYPTO";
  currencies: Currency[];
  active: boolean;
}

export interface PlanPrice {
  currency: Currency;
  priceCents: number;
}

export interface PlanOffer {
  id: string;
  name: string;
  kind: "NEW" | "RENEWAL";
  durationDays: number;
  prices: PlanPrice[];
  stockState: StockState;
}

export interface CatalogProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  whatIncluded: string | null;
  compatibility: string | null;
  activationGuide: string | null;
  faq: { question: string; answer: string }[] | null;
  categoryName: string | null;
  requiresToolUsername: boolean;
  plans: PlanOffer[];
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar ${path}`);
  }
  return (await res.json()) as T;
}

export async function fetchCatalogProducts(params: {
  query?: string;
  category?: string;
  sort?: CatalogSort;
  pageSize?: number;
}): Promise<CatalogProductsResult> {
  const search = new URLSearchParams();
  if (params.query) search.set("query", params.query);
  if (params.category) search.set("category", params.category);
  if (params.sort) search.set("sort", params.sort);
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return getJson<CatalogProductsResult>(`/catalog/products${qs ? `?${qs}` : ""}`);
}

export async function fetchCatalogCategories(): Promise<CatalogCategory[]> {
  return getJson<CatalogCategory[]>("/catalog/categories");
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  return getJson<PaymentMethod[]>("/payment-methods?currency=PEN");
}

export async function fetchProductDetail(slug: string): Promise<CatalogProductDetail | null> {
  const res = await fetch(`${API_URL}/catalog/products/${slug}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar /catalog/products/${slug}`);
  }
  return (await res.json()) as CatalogProductDetail;
}
