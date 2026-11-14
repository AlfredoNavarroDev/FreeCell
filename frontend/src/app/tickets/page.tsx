import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TicketsScreen } from "@/components/tickets-screen";
import { listTickets } from "@/lib/support-client";

export default async function TicketsPage() {
  const result = await listTickets();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-6 py-10">
          {!result.ok ? (
            <p className="text-danger-ink">{result.message}</p>
          ) : (
            <TicketsScreen initial={result.data.items} />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
