"use client";

import Link from "next/link";
import { useState } from "react";
import { createTicket, type TicketSummaryView } from "@/lib/support-client";

const STATUS_LABEL = { OPEN: "Abierto", CLOSED: "Cerrado" } as const;
const STATUS_BADGE = {
  OPEN: "bg-success-bg text-success-ink",
  CLOSED: "bg-bg text-muted",
} as const;

export function TicketsScreen({ initial }: { initial: TicketSummaryView[] }) {
  const [tickets, setTickets] = useState(initial);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = subject.trim().length >= 3 && body.trim().length >= 1 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await createTicket(subject.trim(), body.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const { id, subject: createdSubject, status, createdAt, updatedAt } = result.data;
    setTickets([{ id, subject: createdSubject, status, createdAt, updatedAt }, ...tickets]);
    setSubject("");
    setBody("");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section aria-label="Mis tickets">
        <h1 className="mb-5 font-display text-2xl font-bold text-ink">Soporte</h1>
        {tickets.length === 0 ? (
          <div className="rounded-2xl border border-line-soft bg-surface p-10 text-center">
            <p className="font-display text-xl font-bold text-ink">Aún no tienes tickets</p>
            <p className="mt-1 text-muted">Escríbenos desde el formulario y te responderemos aquí.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3"
                >
                  <span className="font-semibold text-ink">{t.subject}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-5"
        aria-label="Nuevo ticket"
      >
        <h2 className="font-display text-lg font-bold text-ink">Nuevo ticket</h2>
        <label htmlFor="ticket-subject" className="font-medium text-ink">
          Asunto
        </label>
        <input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          className="h-11 rounded-[10px] border border-line-strong px-3 text-ink"
        />
        <label htmlFor="ticket-body" className="font-medium text-ink">
          Mensaje
        </label>
        <textarea
          id="ticket-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={5}
          className="rounded-[10px] border border-line-strong p-3 text-ink"
        />
        {error ? <p className="rounded-[10px] bg-danger-bg px-3 py-2 text-danger-ink">{error}</p> : null}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-12 items-center justify-center rounded-[10px] bg-accent px-6 font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Enviar ticket
        </button>
      </form>
    </div>
  );
}
