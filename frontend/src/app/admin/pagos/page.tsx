import { AdminPaymentsQueue } from "@/components/admin-payments-queue";
import { fetchAdminPayments } from "@/lib/admin-payments-client";

export default async function AdminPagosPage() {
  const result = await fetchAdminPayments("PENDING");

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Pagos por revisar</h1>
      {!result.ok ? (
        <p className="text-danger-ink">{result.message}</p>
      ) : (
        <AdminPaymentsQueue initialPayments={result.data.items} />
      )}
    </div>
  );
}
