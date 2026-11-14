import { AdminSupportQueue } from "@/components/admin-support-queue";
import { fetchAdminTickets } from "@/lib/support-admin-client";

export default async function AdminSoportePage() {
  const result = await fetchAdminTickets("OPEN");

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Soporte</h1>
      {!result.ok ? (
        <p className="text-danger-ink">{result.message}</p>
      ) : (
        <AdminSupportQueue initialTickets={result.data.items} />
      )}
    </div>
  );
}
