"use client";

import { useEffect, useState } from "react";
import { TicketMessages } from "@/components/ticket-messages";
import {
  closeAdminTicket,
  getAdminTicket,
  replyAdminTicket,
  type AdminTicketDetail,
} from "@/lib/support-admin-client";

export function AdminTicketDetailPanel({
  ticketId,
  onClosed,
  onError,
}: {
  ticketId: string;
  onClosed: (subject: string) => void;
  onError: (message: string) => void;
}) {
  const [ticket, setTicket] = useState<AdminTicketDetail | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdminTicket(ticketId).then((result) => {
      if (cancelled) return;
      if (result.ok) setTicket(result.data);
      else onError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [ticketId, onError]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 1 || submitting) return;
    setSubmitting(true);
    try {
      const result = await replyAdminTicket(ticketId, body.trim());
      if (!result.ok) {
        onError(result.message);
        return;
      }
      setTicket(result.data);
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose() {
    if (!ticket || submitting) return;
    setSubmitting(true);
    try {
      const result = await closeAdminTicket(ticketId);
      if (!result.ok) {
        onError(result.message);
        return;
      }
      onClosed(ticket.subject);
    } finally {
      setSubmitting(false);
    }
  }

  if (!ticket) {
    return (
      <section aria-label="Detalle del ticket" className="flex-1 rounded-2xl border border-line-soft bg-surface p-6">
        <p className="text-muted">Cargando…</p>
      </section>
    );
  }

  return (
    <section aria-label="Detalle del ticket" className="flex-1 rounded-2xl border border-line-soft bg-surface p-6">
      <div className="mb-5">
        <p className="font-display text-xl font-bold text-ink">{ticket.subject}</p>
        <p className="text-sm text-muted">{ticket.customerName ?? ticket.customerEmail}</p>
      </div>
      <TicketMessages messages={ticket.messages} />
      <form onSubmit={handleReply} className="mt-5 flex flex-col gap-3 border-t border-line-soft pt-5">
        <label htmlFor="admin-reply" className="font-medium text-ink">
          Responder
        </label>
        <textarea
          id="admin-reply"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          className="rounded-[10px] border border-line-strong p-3 text-sm text-ink"
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={body.trim().length < 1 || submitting}
            className="flex h-12 flex-1 items-center justify-center rounded-[10px] bg-success-ink px-6 text-base font-semibold text-white disabled:opacity-50"
          >
            Enviar respuesta
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="flex h-12 items-center justify-center rounded-[10px] border border-line-strong px-6 text-base font-semibold text-ink disabled:opacity-50"
          >
            Cerrar ticket
          </button>
        </div>
      </form>
    </section>
  );
}
