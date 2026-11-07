"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Inicio", badge: false },
  { href: "/admin/pagos", label: "Pagos", badge: true },
  { href: "/admin/inventario", label: "Inventario", badge: false },
  { href: "/admin/reclamos", label: "Reclamos", badge: false },
] as const;

export function AdminSidebar({
  pendingPaymentsCount,
  adminName,
}: {
  pendingPaymentsCount: number;
  adminName: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full max-w-[260px] flex-col gap-1 border-r border-line bg-surface p-4">
      <div className="px-2 pb-5 font-display text-lg font-bold tracking-tight text-ink">Free Cell</div>
      <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted">ADMIN</div>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
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
            {item.badge && pendingPaymentsCount > 0 ? (
              <span className="ml-auto rounded-full bg-danger-bg px-2 text-xs font-semibold text-danger-ink">
                {pendingPaymentsCount}
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
