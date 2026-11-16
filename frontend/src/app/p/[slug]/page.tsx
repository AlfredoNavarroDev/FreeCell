import { notFound } from "next/navigation";
import { PlanPicker } from "@/components/plan-picker";
import { ProductTabs } from "@/components/product-tabs";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StarRating } from "@/components/star-rating";
import { fetchProductDetail } from "@/lib/catalog-client";
import { fetchProductReviews } from "@/lib/reviews-public-client";

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const [product, reviews] = await Promise.all([fetchProductDetail(slug), fetchProductReviews(slug, 1, 10, false)]);

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
          {product.ratingCount > 0 && product.ratingAvg !== null ? (
            <div className="mt-2">
              <StarRating value={product.ratingAvg} count={product.ratingCount} />
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
            <ProductTabs product={product} reviews={reviews} />
            <PlanPicker product={product} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
