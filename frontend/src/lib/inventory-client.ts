"use server";

import { auth } from "@/auth";
import type { StockState } from "./catalog-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export interface InventoryItemView {
  planId: string;
  productName: string;
  planName: string;
  lowStockThreshold: number;
  available: number;
  reserved: number;
  sold: number;
  status: StockState;
}

export interface InventoryView {
  items: InventoryItemView[];
  usdPenRate: number | null;
}

export interface AvailableLicenseView {
  id: string;
  createdAt: string;
}

export interface BatchPreviewResultView {
  validCount: number;
  duplicateCount: number;
  errorCount: number;
}

export interface CreateBatchInput {
  planId: string;
  costCurrency: "PEN" | "USD";
  unitCostCents: number;
  supplier?: string;
  secrets: string[];
}

export interface CreateBatchResultView {
  batchId: string;
  loadedCount: number;
  duplicateCount: number;
  errorCount: number;
}

export type InventoryActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown },
): Promise<InventoryActionResult<T>> {
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

export async function fetchInventory(): Promise<InventoryActionResult<InventoryView>> {
  return callBackend<InventoryView>("/admin/inventory", { method: "GET" });
}

export async function fetchAvailableLicenses(
  planId: string,
): Promise<InventoryActionResult<AvailableLicenseView[]>> {
  return callBackend<AvailableLicenseView[]>(`/admin/inventory/plans/${planId}/licenses`, {
    method: "GET",
  });
}

export async function previewBatch(
  planId: string,
  secrets: string[],
): Promise<InventoryActionResult<BatchPreviewResultView>> {
  return callBackend<BatchPreviewResultView>("/admin/inventory/batches/preview", {
    method: "POST",
    body: { planId, secrets },
  });
}

export async function createBatch(
  input: CreateBatchInput,
): Promise<InventoryActionResult<CreateBatchResultView>> {
  return callBackend<CreateBatchResultView>("/admin/inventory/batches", {
    method: "POST",
    body: input,
  });
}

export async function voidLicense(
  id: string,
  reason: string,
): Promise<InventoryActionResult<void>> {
  return callBackend<void>(`/admin/inventory/licenses/${id}/void`, {
    method: "POST",
    body: { reason },
  });
}

export async function updateUsdRate(rate: number): Promise<InventoryActionResult<void>> {
  return callBackend<void>("/admin/inventory/usd-rate", {
    method: "PUT",
    body: { rate },
  });
}
