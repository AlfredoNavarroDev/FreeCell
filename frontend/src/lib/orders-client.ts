"use server";

import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type OrderStatusView =
  | "PENDING_PAYMENT"
  | "IN_REVIEW"
  | "PENDING_ACTIVATION"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderItemView {
  planId: string;
  unitPriceCents: number;
  productName: string;
  planName: string;
}

export interface OrderView {
  id: string;
  orderNumber: number;
  status: OrderStatusView;
  totalCents: number;
  currency: "PEN" | "USD";
  expiresAt: string;
  cancelReason: string | null;
  items: OrderItemView[];
  paymentStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  paymentRejectionReason: string | null;
  tracking: {
    createdAt: string;
    paymentApprovedAt: string | null;
    deliveredAt: string | null;
  };
}

export interface PaginatedOrders {
  items: OrderView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RevealedLicenseView {
  orderItemId: string;
  planId: string;
  secret: string;
}

export type OrdersActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<OrdersActionResult<T>> {
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

  if (res.status === 204) {
    return { ok: true, data: undefined as T };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}

export async function createOrder(
  items: { planId: string; qty: number }[],
  toolUsername?: string,
): Promise<OrdersActionResult<OrderView>> {
  return callBackend<OrderView>("/orders", {
    method: "POST",
    body: { currency: "PEN", items, ...(toolUsername ? { toolUsername } : {}) },
  });
}

export async function getOrder(orderId: string): Promise<OrdersActionResult<OrderView>> {
  return callBackend<OrderView>(`/orders/${orderId}`, { method: "GET" });
}

export async function requestPaymentUploadUrl(
  orderId: string,
  contentType: "image/jpeg" | "image/png" | "application/pdf",
  fileSizeBytes: number,
): Promise<OrdersActionResult<{ uploadUrl: string; proofKey: string }>> {
  return callBackend(`/orders/${orderId}/payment/upload-url`, {
    method: "POST",
    body: { contentType, fileSizeBytes },
  });
}

export async function submitPayment(
  orderId: string,
  payload: {
    paymentMethodId: string;
    proofKey: string;
    proofHash: string;
    operationNumber: string;
    acceptsLegalDeclaration: boolean;
  },
): Promise<OrdersActionResult<OrderView>> {
  return callBackend<OrderView>(`/orders/${orderId}/payment`, { method: "POST", body: payload });
}

export async function resendVerificationEmail(): Promise<OrdersActionResult<undefined>> {
  return callBackend<undefined>("/auth/resend-verification", { method: "POST" });
}

export async function listOrders(
  status?: OrderStatusView,
): Promise<OrdersActionResult<PaginatedOrders>> {
  const query = new URLSearchParams({ pageSize: "50" });
  if (status) query.set("status", status);
  return callBackend<PaginatedOrders>(`/orders?${query.toString()}`, { method: "GET" });
}

export async function revealLicense(
  orderId: string,
): Promise<OrdersActionResult<RevealedLicenseView[]>> {
  return callBackend<RevealedLicenseView[]>(`/orders/${orderId}/license/reveal`, {
    method: "POST",
  });
}
