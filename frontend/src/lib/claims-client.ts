"use server";

import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type ClaimStatus = "OPEN" | "RESOLVED" | "REJECTED";

export interface ClaimView {
  id: string;
  orderId: string;
  orderNumber: number;
  status: ClaimStatus;
  reason: string;
  rejectionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PaginatedClaims {
  items: ClaimView[];
  total: number;
  page: number;
  pageSize: number;
}

export type ClaimsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<ClaimsActionResult<T>> {
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

export async function createClaim(
  orderId: string,
  orderItemId: string,
  reason: string,
): Promise<ClaimsActionResult<ClaimView>> {
  return callBackend<ClaimView>("/claims", {
    method: "POST",
    body: { orderId, orderItemId, reason },
  });
}

export async function listClaims(): Promise<ClaimsActionResult<PaginatedClaims>> {
  return callBackend<PaginatedClaims>("/claims?pageSize=50", { method: "GET" });
}
