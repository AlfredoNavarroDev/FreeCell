import { CatalogGrid } from "@/components/catalog-grid";
import { FaqSection } from "@/components/faq-section";
import { Guarantees } from "@/components/guarantees";
import { HeroSearch } from "@/components/hero-search";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function CatalogPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <HeroSearch />
        <Guarantees />
        <CatalogGrid />
        <FaqSection />
      </main>
      <SiteFooter />
    </>
  );
}
