import { OrdersScreen } from "@/components/orders-screen";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { listClaims } from "@/lib/claims-client";
import { listOrders } from "@/lib/orders-client";
import { listMyReviews } from "@/lib/reviews-client";

export default async function PedidosPage() {
  const [ordersResult, claimsResult, reviewsResult] = await Promise.all([
    listOrders(),
    listClaims(),
    listMyReviews(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-6 py-10">
          {!ordersResult.ok ? (
            <p className="text-danger-ink">{ordersResult.message}</p>
          ) : (
            <OrdersScreen
              initial={ordersResult.data.items}
              initialClaims={claimsResult.ok ? claimsResult.data.items : []}
              initialReviews={reviewsResult.ok ? reviewsResult.data.items : []}
            />
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
