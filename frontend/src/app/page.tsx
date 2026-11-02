import { CatalogGrid } from "@/components/catalog-grid";
import { FaqSection } from "@/components/faq-section";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TrustStats } from "@/components/trust-stats";
import {
  fetchCatalogCategories,
  fetchCatalogProducts,
  fetchPaymentMethods,
  type CatalogSort,
} from "@/lib/catalog-client";

const VALID_SORTS: CatalogSort[] = ["price_asc", "price_desc", "newest"];

function parseSort(value: string | undefined): CatalogSort | undefined {
  return VALID_SORTS.includes(value as CatalogSort) ? (value as CatalogSort) : undefined;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; category?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);

  try {
    const [categories, productsResult, paymentMethods] = await Promise.all([
      fetchCatalogCategories(),
      fetchCatalogProducts({ query: params.query, category: params.category, sort, pageSize: 50 }),
      fetchPaymentMethods(),
    ]);

    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <Hero paymentMethods={paymentMethods} query={params.query} category={params.category} sort={sort} />
          <TrustStats totalProducts={productsResult.total} />
          <CatalogGrid
            products={productsResult.items}
            categories={categories}
            total={productsResult.total}
            selectedCategory={params.category}
            selectedSort={sort}
            selectedQuery={params.query}
          />
          <HowItWorks />
          <FaqSection />
        </main>
        <SiteFooter />
      </>
    );
  } catch {
    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <section className="mx-auto max-w-[1200px] px-6 py-24 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">No pudimos cargar la tienda</h1>
            <p className="mt-2 text-muted">Intenta de nuevo en un momento.</p>
          </section>
        </main>
        <SiteFooter />
      </>
    );
  }
}
