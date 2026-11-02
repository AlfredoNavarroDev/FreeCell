import { HeroSearch } from "./hero-search";
import type { CatalogSort, PaymentMethod } from "@/lib/catalog-client";

export function Hero({
  paymentMethods,
  query,
  category,
  sort,
}: {
  paymentMethods: PaymentMethod[];
  query?: string;
  category?: string;
  sort?: CatalogSort;
}) {
  return (
    <section className="bg-surface">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <h1 className="font-display max-w-xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            Licencias para tus herramientas de servicio técnico
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Compra, paga por Yape/Plin o transferencia y recibe tu licencia en tu cuenta.
          </p>
          <HeroSearch defaultQuery={query} category={category} sort={sort} />
        </div>

        <div className="rounded-[24px] border border-accent-soft-bg bg-surface/70 p-6 shadow-sm backdrop-blur-md">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-accent-press">
            Garantías Free Cell
          </p>
          <ul className="mt-4 space-y-3 text-sm text-ink">
            <li>Reposición de clave dentro de 7 días si falla.</li>
            <li>Soporte real por WhatsApp, no un bot.</li>
          </ul>
          {paymentMethods.length > 0 ? (
            <>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">Pagás con</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {paymentMethods.map((method) => (
                  <li
                    key={method.id}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink"
                  >
                    {method.name}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
