"use server";

import { auth } from "@/auth";
import type { TicketMessageView, TicketStatus } from "@/lib/support-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export interface AdminTicketSummary {
  ticketId: string;
  subject: string;
  status: TicketStatus;
  customerName: string | null;
  customerEmail: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

export interface AdminTicketDetail {
  ticketId: string;
  subject: string;
  status: TicketStatus;
  customerName: string | null;
  customerEmail: string;
  createdAt: string;
  messages: TicketMessageView[];
}

export interface AdminTicketsPage {
  items: AdminTicketSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketCloseResult {
  ticketId: string;
  status: TicketStatus;
}

export type AdminSupportActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<AdminSupportActionResult<T>> {
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

export async function fetchAdminTickets(
  status: TicketStatus = "OPEN",
  pageSize = 50,
): Promise<AdminSupportActionResult<AdminTicketsPage>> {
  return callBackend<AdminTicketsPage>(`/admin/support-tickets?status=${status}&pageSize=${pageSize}`, {
    method: "GET",
  });
}

export async function getAdminTicket(id: string): Promise<AdminSupportActionResult<AdminTicketDetail>> {
  return callBackend<AdminTicketDetail>(`/admin/support-tickets/${id}`, { method: "GET" });
}

export async function replyAdminTicket(
  id: string,
  body: string,
): Promise<AdminSupportActionResult<AdminTicketDetail>> {
  return callBackend<AdminTicketDetail>(`/admin/support-tickets/${id}/messages`, {
    method: "POST",
    body: { body },
  });
}

export async function closeAdminTicket(id: string): Promise<AdminSupportActionResult<TicketCloseResult>> {
  return callBackend<TicketCloseResult>(`/admin/support-tickets/${id}/close`, { method: "POST" });
}
