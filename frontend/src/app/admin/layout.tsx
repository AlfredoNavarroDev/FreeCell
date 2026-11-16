import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import { fetchAdminPayments } from "@/lib/admin-payments-client";
import { fetchAdminClaims } from "@/lib/claims-admin-client";
import { fetchAdminReviews } from "@/lib/reviews-admin-client";
import { fetchAdminTickets } from "@/lib/support-admin-client";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [session, pendingResult, claimsResult, ticketsResult, reviewsResult] = await Promise.all([
    auth(),
    fetchAdminPayments("PENDING", 1),
    fetchAdminClaims("OPEN", 1),
    fetchAdminTickets("OPEN", 1),
    fetchAdminReviews("PENDING", 1),
  ]);
  const pendingSupportCount =
    (ticketsResult.ok ? ticketsResult.data.total : 0) + (reviewsResult.ok ? reviewsResult.data.total : 0);
  const pendingPaymentsCount = pendingResult.ok ? pendingResult.data.total : 0;
  const pendingClaimsCount = claimsResult.ok ? claimsResult.data.total : 0;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        pendingPaymentsCount={pendingPaymentsCount}
        pendingClaimsCount={pendingClaimsCount}
        pendingTicketsCount={pendingSupportCount}
        adminName={session?.user.name ?? null}
      />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
