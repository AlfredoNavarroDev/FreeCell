import { InventoryScreen } from "@/components/inventory-screen";
import { fetchInventory } from "@/lib/inventory-client";

export default async function AdminInventarioPage() {
  const result = await fetchInventory();

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Inventario</h1>
      {!result.ok ? (
        <p className="text-danger-ink">{result.message}</p>
      ) : (
        <InventoryScreen initial={result.data} />
      )}
    </div>
  );
}
