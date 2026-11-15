import { AdminSupportTabs } from "@/components/admin-support-tabs";
import { fetchAdminReviews } from "@/lib/reviews-admin-client";
import { fetchAdminTickets } from "@/lib/support-admin-client";

export default async function AdminSoportePage() {
  const [ticketsResult, reviewsResult] = await Promise.all([fetchAdminTickets("OPEN"), fetchAdminReviews("PENDING")]);

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Soporte</h1>
      {!ticketsResult.ok ? (
        <p className="text-danger-ink">{ticketsResult.message}</p>
      ) : (
        <AdminSupportTabs
          initialTickets={ticketsResult.data.items}
          initialReviews={reviewsResult.ok ? reviewsResult.data.items : []}
          reviewsError={reviewsResult.ok ? null : reviewsResult.message}
        />
      )}
    </div>
  );
}
