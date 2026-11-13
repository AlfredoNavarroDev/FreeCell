import { OrdersScreen } from "@/components/orders-screen";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { listOrders } from "@/lib/orders-client";

export default async function PedidosPage() {
  const result = await listOrders();

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-6 py-10">
          {!result.ok ? (
            <p className="text-danger-ink">{result.message}</p>
          ) : (
            <OrdersScreen initial={result.data.items} />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
