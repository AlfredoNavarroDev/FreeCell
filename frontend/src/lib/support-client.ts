"use server";

import { auth } from "@/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type TicketStatus = "OPEN" | "CLOSED";

export interface TicketMessageView {
  id: string;
  body: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface TicketSummaryView {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetailView extends TicketSummaryView {
  messages: TicketMessageView[];
}

export interface PaginatedTickets {
  items: TicketSummaryView[];
  total: number;
  page: number;
  pageSize: number;
}

export type SupportActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function callBackend<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<SupportActionResult<T>> {
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

export async function createTicket(subject: string, body: string): Promise<SupportActionResult<TicketDetailView>> {
  return callBackend<TicketDetailView>("/support-tickets", { method: "POST", body: { subject, body } });
}

export async function listTickets(): Promise<SupportActionResult<PaginatedTickets>> {
  return callBackend<PaginatedTickets>("/support-tickets?pageSize=50", { method: "GET" });
}

export async function getTicket(id: string): Promise<SupportActionResult<TicketDetailView>> {
  return callBackend<TicketDetailView>(`/support-tickets/${id}`, { method: "GET" });
}

export async function replyTicket(id: string, body: string): Promise<SupportActionResult<TicketDetailView>> {
  return callBackend<TicketDetailView>(`/support-tickets/${id}/messages`, { method: "POST", body: { body } });
}
