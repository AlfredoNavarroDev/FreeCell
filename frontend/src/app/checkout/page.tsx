import { CheckoutSummary } from "@/components/checkout-summary";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function CheckoutPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[640px] px-6 py-10">
          <h1 className="font-display text-2xl font-bold text-ink">Resumen de tu pedido</h1>
          <div className="mt-6">
            <CheckoutSummary />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
