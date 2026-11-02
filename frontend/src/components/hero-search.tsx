import type { CatalogSort } from "@/lib/catalog-client";

export function HeroSearch({
  defaultQuery,
  category,
  sort,
}: {
  defaultQuery?: string;
  category?: string;
  sort?: CatalogSort;
}) {
  return (
    <form className="mt-8 flex max-w-xl items-center gap-2" role="search" action="/" method="GET">
      <label htmlFor="catalog-search" className="sr-only">
        Buscar herramienta
      </label>
      <input
        id="catalog-search"
        name="query"
        type="search"
        defaultValue={defaultQuery}
        placeholder="Busca una herramienta…"
        className="h-[52px] flex-1 rounded-[10px] border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-muted"
      />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {sort ? <input type="hidden" name="sort" value={sort} /> : null}
      <button
        type="submit"
        className="h-[52px] rounded-[10px] bg-accent px-6 text-base font-medium text-white hover:bg-accent-hover"
      >
        Buscar
      </button>
    </form>
  );
}
