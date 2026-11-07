"use server";

import { auth } from "@/auth";
import type { OrderView } from "./orders-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type AdminPaymentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PaymentRejectionReason = "AMOUNT_MISMATCH" | "ILLEGIBLE_PROOF" | "OPERATION_NOT_FOUND";

export interface AdminPaymentItemView {
  planId: string;
  unitPriceCents: number;
  productName: string;
  planName: string;
  availableStock: number;
}

export interface AdminPaymentView {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  status: AdminPaymentStatus;
  paymentMethodId: string;
  paymentMethodName: string;
  operationNumber: string;
  proofUrl: string;
  totalCents: number;
  currency: "PEN" | "USD";
  expiresAt: string;
  toolUsername: string | null;
  items: AdminPaymentItemView[];
  createdAt: string;
  customerName: string | null;
  customerEmail: string;
}

export interface AdminPaymentsPage {
  items: AdminPaymentView[];
  total: number;
  page: number;
  pageSize: number;
}

export type AdminPaymentsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<AdminPaymentsActionResult<T>> {
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

export async function fetchAdminPayments(
  status: AdminPaymentStatus = "PENDING",
  pageSize = 50,
): Promise<AdminPaymentsActionResult<AdminPaymentsPage>> {
  return callBackend<AdminPaymentsPage>(`/admin/payments?status=${status}&pageSize=${pageSize}`, {
    method: "GET",
  });
}

export async function approvePayment(paymentId: string): Promise<AdminPaymentsActionResult<OrderView>> {
  return callBackend<OrderView>(`/admin/payments/${paymentId}/approve`, { method: "POST" });
}

export async function rejectPayment(
  paymentId: string,
  reason: PaymentRejectionReason,
): Promise<AdminPaymentsActionResult<OrderView>> {
  return callBackend<OrderView>(`/admin/payments/${paymentId}/reject`, {
    method: "POST",
    body: { reason },
  });
}
