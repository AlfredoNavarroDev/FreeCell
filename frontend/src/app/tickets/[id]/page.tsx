import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TicketThread } from "@/components/ticket-thread";
import { getTicket } from "@/lib/support-client";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getTicket(id);
  if (!result.ok && result.status === 404) {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[800px] px-6 py-10">
          <Link href="/tickets" className="mb-4 inline-flex min-h-11 items-center text-sm font-medium text-muted">
            ← Volver a mis tickets
          </Link>
          {!result.ok ? <p className="text-danger-ink">{result.message}</p> : <TicketThread initial={result.data} />}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
