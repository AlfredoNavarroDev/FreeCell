import { notFound } from "next/navigation";
import { PaymentForm } from "@/components/payment-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { fetchPaymentMethods } from "@/lib/catalog-client";
import { getOrder } from "@/lib/orders-client";

export default async function PaymentPage({ params }: PageProps<"/checkout/[orderId]/pago">) {
  const { orderId } = await params;
  const [orderResult, paymentMethods] = await Promise.all([getOrder(orderId), fetchPaymentMethods()]);

  if (!orderResult.ok) {
    notFound();
  }
  if (orderResult.data.status !== "PENDING_PAYMENT") {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[640px] px-6 py-10">
          <h1 className="font-display text-2xl font-bold text-ink">Pago del pedido #{orderResult.data.orderNumber}</h1>
          <div className="mt-6">
            <PaymentForm
              orderId={orderResult.data.id}
              expiresAt={orderResult.data.expiresAt}
              paymentMethods={paymentMethods.filter((method) => method.active && method.currencies.includes("PEN"))}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
