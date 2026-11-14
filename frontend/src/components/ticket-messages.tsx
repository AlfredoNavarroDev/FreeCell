import type { TicketMessageView } from "@/lib/support-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" });
}

export function TicketMessages({ messages }: { messages: TicketMessageView[] }) {
  return (
    <ol aria-label="Mensajes del ticket" className="flex flex-col gap-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`max-w-[85%] rounded-xl px-4 py-3 ${
            m.isAdmin ? "self-start bg-accent-soft-bg text-accent-soft-ink" : "self-end bg-bg text-ink"
          }`}
        >
          <p className="mb-1 text-xs font-semibold">{m.isAdmin ? "Soporte Free Cell" : "Tú"}</p>
          <p className="whitespace-pre-wrap">{m.body}</p>
          <p className="mt-1 text-xs text-muted">{formatDate(m.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
