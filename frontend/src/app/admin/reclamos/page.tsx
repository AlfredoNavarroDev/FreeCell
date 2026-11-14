import { AdminClaimsQueue } from "@/components/admin-claims-queue";
import { fetchAdminClaims } from "@/lib/claims-admin-client";

export default async function AdminReclamosPage() {
  const result = await fetchAdminClaims("OPEN");

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Reclamos</h1>
      {!result.ok ? (
        <p className="text-danger-ink">{result.message}</p>
      ) : (
        <AdminClaimsQueue initialClaims={result.data.items} />
      )}
    </div>
  );
}
