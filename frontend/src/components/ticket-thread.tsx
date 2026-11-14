"use client";

import { useState } from "react";
import { TicketMessages } from "@/components/ticket-messages";
import { replyTicket, type TicketDetailView } from "@/lib/support-client";

export function TicketThread({ initial }: { initial: TicketDetailView }) {
  const [ticket, setTicket] = useState(initial);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await replyTicket(ticket.id, body.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTicket(result.data);
    setBody("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{ticket.subject}</h1>
        <span className="rounded-full bg-bg px-3 py-1 text-sm font-semibold text-ink">
          {ticket.status === "OPEN" ? "Abierto" : "Cerrado"}
        </span>
      </div>
      <TicketMessages messages={ticket.messages} />
      {ticket.status === "OPEN" ? (
        <form onSubmit={handleReply} className="flex flex-col gap-3 border-t border-line-soft pt-5">
          <label htmlFor="reply-body" className="font-medium text-ink">
            Tu respuesta
          </label>
          <textarea
            id="reply-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={4}
            className="rounded-[10px] border border-line-strong p-3 text-ink"
          />
          {error ? <p className="rounded-[10px] bg-danger-bg px-3 py-2 text-danger-ink">{error}</p> : null}
          <button
            type="submit"
            disabled={body.trim().length < 1 || submitting}
            className="flex h-12 items-center justify-center self-start rounded-[10px] bg-accent px-6 font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Enviar respuesta
          </button>
        </form>
      ) : (
        <p className="rounded-[10px] bg-bg px-4 py-3 text-muted">
          Ticket cerrado. Abre uno nuevo si necesitas más ayuda.
        </p>
      )}
    </div>
  );
}
