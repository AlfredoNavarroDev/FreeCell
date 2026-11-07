import { notFound } from "next/navigation";
import { PlanPicker } from "@/components/plan-picker";
import { ProductTabs } from "@/components/product-tabs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { fetchProductDetail } from "@/lib/catalog-client";

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const product = await fetchProductDetail(slug);

  if (!product) {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-[1200px] px-6 py-10">
          <p className="text-xs font-medium text-muted">{product.categoryName ?? "Sin categoría"}</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-ink">{product.name}</h1>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
            <ProductTabs product={product} />
            <PlanPicker product={product} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
