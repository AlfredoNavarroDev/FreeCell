"use server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export interface PublicReview {
  id: string;
  rating: number;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface ProductReviewsPage {
  items: PublicReview[];
  total: number;
  page: number;
  pageSize: number;
  ratingAvg: number | null;
  ratingCount: number;
}

export async function fetchProductReviews(
  slug: string,
  page = 1,
  pageSize = 10,
  fresh = true,
): Promise<ProductReviewsPage | null> {
  try {
    const res = await fetch(
      `${API_URL}/catalog/products/${encodeURIComponent(slug)}/reviews?page=${page}&pageSize=${pageSize}`,
      fresh ? { cache: "no-store" } : { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as ProductReviewsPage;
  } catch {
    return null;
  }
}
