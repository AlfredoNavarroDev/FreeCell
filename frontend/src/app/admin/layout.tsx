import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import { fetchAdminPayments } from "@/lib/admin-payments-client";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [session, pendingResult] = await Promise.all([auth(), fetchAdminPayments("PENDING", 1)]);
  const pendingPaymentsCount = pendingResult.ok ? pendingResult.data.total : 0;

  return (
    <div className="flex min-h-screen">
      <AdminSidebar pendingPaymentsCount={pendingPaymentsCount} adminName={session?.user.name ?? null} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
