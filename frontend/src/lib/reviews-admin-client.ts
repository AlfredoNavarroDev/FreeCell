"use server";

import { auth } from "@/auth";
import type { ReviewStatus } from "@/lib/reviews-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export interface AdminReviewView {
  reviewId: string;
  status: ReviewStatus;
  rating: number;
  body: string;
  productName: string;
  orderNumber: number;
  customerName: string | null;
  customerEmail: string;
  createdAt: string;
}

export interface AdminReviewsPage {
  items: AdminReviewView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReviewActionResult {
  reviewId: string;
  status: ReviewStatus;
}

export type AdminReviewsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST" },
): Promise<AdminReviewsActionResult<T>> {
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

export async function fetchAdminReviews(
  status: ReviewStatus = "PENDING",
  pageSize = 50,
): Promise<AdminReviewsActionResult<AdminReviewsPage>> {
  return callBackend<AdminReviewsPage>(`/admin/reviews?status=${status}&pageSize=${pageSize}`, {
    method: "GET",
  });
}

export async function approveReview(reviewId: string): Promise<AdminReviewsActionResult<ReviewActionResult>> {
  return callBackend<ReviewActionResult>(`/admin/reviews/${reviewId}/approve`, { method: "POST" });
}

export async function hideReview(reviewId: string): Promise<AdminReviewsActionResult<ReviewActionResult>> {
  return callBackend<ReviewActionResult>(`/admin/reviews/${reviewId}/hide`, { method: "POST" });
}
