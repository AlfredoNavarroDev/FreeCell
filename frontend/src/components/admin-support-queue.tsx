"use client";

import { useCallback, useState } from "react";
import { AdminTicketDetailPanel } from "@/components/admin-ticket-detail";
import { fetchAdminTickets, type AdminTicketSummary } from "@/lib/support-admin-client";

export function AdminSupportQueue({ initialTickets }: { initialTickets: AdminTicketSummary[] }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState<string | null>(initialTickets[0]?.ticketId ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((msg: string) => setError(msg), []);

  async function handleClosed(subject: string) {
    const result = await fetchAdminTickets("OPEN");
    const fresh = result.ok ? result.data.items : tickets;
    setError(result.ok ? null : result.message);
    setTickets(fresh);
    setSelectedId(fresh[0]?.ticketId ?? null);
    setMessage(`Ticket "${subject}" cerrado.`);
  }

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}
      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-line-soft bg-surface p-14 text-center">
          <p className="font-display text-xl font-bold text-ink">Sin tickets abiertos</p>
          <p className="mt-1 text-muted">Cuando un cliente escriba a soporte, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <p className="text-muted">{tickets.length} abiertos</p>
          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Cola de tickets" className="flex w-full max-w-[360px] flex-col gap-2">
              {tickets.map((t) => {
                const active = t.ticketId === selectedId;
                return (
                  <button
                    key={t.ticketId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedId(t.ticketId);
                      setError(null);
                      setMessage(null);
                    }}
                    className={`flex min-h-11 flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left ${
                      active ? "border-accent bg-accent-soft-bg" : "border-line-soft bg-surface"
                    }`}
                  >
                    <span className="font-semibold text-ink">{t.subject}</span>
                    <span className="text-sm text-muted">{t.customerName ?? t.customerEmail}</span>
                    <span className="text-sm text-muted">{t.messageCount} mensajes</span>
                  </button>
                );
              })}
            </section>
            {selectedId ? (
              <AdminTicketDetailPanel
                key={selectedId}
                ticketId={selectedId}
                onClosed={handleClosed}
                onError={handleError}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
