"use server";

import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type ReviewStatus = "PENDING" | "APPROVED" | "HIDDEN";

export interface MyReviewView {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  rating: number;
  body: string;
  status: ReviewStatus;
  createdAt: string;
}

export interface PaginatedMyReviews {
  items: MyReviewView[];
  total: number;
  page: number;
  pageSize: number;
}

export type ReviewsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<ReviewsActionResult<T>> {
  const session = await auth();
  if (!session?.accessToken) {
    return { ok: false, status: 401, message: "Inicia sesión para continuar" };
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message ?? "No pudimos completar la operación";
    return { ok: false, status: res.status, message };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}

export async function createReview(
  orderId: string,
  productId: string,
  rating: number,
  body: string,
): Promise<ReviewsActionResult<MyReviewView>> {
  return callBackend<MyReviewView>("/reviews", {
    method: "POST",
    body: { orderId, productId, rating, body },
  });
}

export async function listMyReviews(): Promise<ReviewsActionResult<PaginatedMyReviews>> {
  return callBackend<PaginatedMyReviews>("/reviews?pageSize=50", { method: "GET" });
}
