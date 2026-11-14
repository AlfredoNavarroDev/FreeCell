"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Inicio", badgeKey: null },
  { href: "/admin/pagos", label: "Pagos", badgeKey: "payments" as const },
  { href: "/admin/inventario", label: "Inventario", badgeKey: null },
  { href: "/admin/reclamos", label: "Reclamos", badgeKey: "claims" as const },
  { href: "/admin/soporte", label: "Soporte", badgeKey: "tickets" as const },
] as const;

export function AdminSidebar({
  pendingPaymentsCount,
  pendingClaimsCount,
  pendingTicketsCount,
  adminName,
}: {
  pendingPaymentsCount: number;
  pendingClaimsCount: number;
  pendingTicketsCount: number;
  adminName: string | null;
}) {
  const pathname = usePathname();
  const counts: Record<string, number> = {
    payments: pendingPaymentsCount,
    claims: pendingClaimsCount,
    tickets: pendingTicketsCount,
  };

  return (
    <aside className="flex w-full max-w-[260px] flex-col gap-1 border-r border-line bg-surface p-4">
      <div className="px-2 pb-5 font-display text-lg font-bold tracking-tight text-ink">Free Cell</div>
      <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted">ADMIN</div>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const count = item.badgeKey ? counts[item.badgeKey] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "true" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium ${
              active ? "bg-accent-soft-bg text-accent-soft-ink" : "text-ink"
            }`}
          >
            {item.label}
            {count > 0 ? (
              <span className="ml-auto rounded-full bg-danger-bg px-2 text-xs font-semibold text-danger-ink">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col gap-1 border-t border-line-soft pt-4">
        <Link href="/" className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-ink">
          Ver tienda
        </Link>
        <p className="px-3 text-sm text-muted">{adminName ?? "Admin"}</p>
      </div>
    </aside>
  );
}
