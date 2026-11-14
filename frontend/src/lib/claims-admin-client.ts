"use server";

import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type AdminClaimStatus = "OPEN" | "RESOLVED" | "REJECTED";

export interface AdminClaimView {
  claimId: string;
  orderId: string;
  orderNumber: number;
  status: AdminClaimStatus;
  reason: string;
  productName: string;
  planName: string;
  availableStock: number;
  createdAt: string;
  customerName: string | null;
  customerEmail: string;
}

export interface AdminClaimsPage {
  items: AdminClaimView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ClaimActionResult {
  claimId: string;
  status: AdminClaimStatus;
  orderNumber: number;
}

export type AdminClaimsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<AdminClaimsActionResult<T>> {
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

export async function fetchAdminClaims(
  status: AdminClaimStatus = "OPEN",
  pageSize = 50,
): Promise<AdminClaimsActionResult<AdminClaimsPage>> {
  return callBackend<AdminClaimsPage>(`/admin/claims?status=${status}&pageSize=${pageSize}`, {
    method: "GET",
  });
}

export async function replaceClaim(claimId: string): Promise<AdminClaimsActionResult<ClaimActionResult>> {
  return callBackend<ClaimActionResult>(`/admin/claims/${claimId}/replace`, { method: "POST" });
}

export async function rejectClaim(
  claimId: string,
  reason: string,
): Promise<AdminClaimsActionResult<ClaimActionResult>> {
  return callBackend<ClaimActionResult>(`/admin/claims/${claimId}/reject`, {
    method: "POST",
    body: { reason },
  });
}
