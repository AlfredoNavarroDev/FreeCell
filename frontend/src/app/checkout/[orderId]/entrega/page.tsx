import { notFound } from "next/navigation";
import { OrderItemsSummary } from "@/components/order-items-summary";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getOrder } from "@/lib/orders-client";

export default async function DeliveryPage({ params }: PageProps<"/checkout/[orderId]/entrega">) {
  const { orderId } = await params;
  const result = await getOrder(orderId);

  if (!result.ok) {
    notFound();
  }
  // Solo tiene sentido confirmar un pago que ya se envió: si el pedido sigue
  // PENDING_PAYMENT, nunca se completó esta pantalla (URL visitada directamente).
  if (result.data.status === "PENDING_PAYMENT") {
    notFound();
  }

  const order = result.data;

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-6 py-16 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">¡Comprobante recibido!</h1>
          <p className="text-muted">
            Pedido #{order.orderNumber} en revisión. Te avisamos en cuanto aprobemos tu pago (hasta 24 horas,
            normalmente antes).
          </p>
          <div className="w-full">
            <OrderItemsSummary orderId={order.id} />
          </div>
          <a
            href="/"
            className="mt-2 flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Volver al catálogo
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
