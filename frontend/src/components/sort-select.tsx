"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CatalogSort } from "@/lib/catalog-client";

const SORT_OPTIONS: { value: CatalogSort | ""; label: string }[] = [
  { value: "", label: "Más relevantes" },
  { value: "price_asc", label: "Precio: menor a mayor" },
  { value: "price_desc", label: "Precio: mayor a menor" },
  { value: "newest", label: "Más recientes" },
];

export function SortSelect({ value }: { value?: CatalogSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (event.target.value) {
      params.set("sort", event.target.value);
    } else {
      params.delete("sort");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Ordenar
      <select
        value={value ?? ""}
        onChange={handleChange}
        className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
