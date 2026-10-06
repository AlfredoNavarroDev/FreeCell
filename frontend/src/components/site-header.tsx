import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="bg-accent-soft-bg px-4 py-2 text-center text-sm text-accent-soft-ink">
        Entrega estimada: [N] min tras aprobar el pago · Soporte por WhatsApp: [wa.me/NÚMERO]
      </div>
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="font-display text-xl font-bold tracking-tight text-ink">
          Free Cell
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-muted">
          <Link href="/" className="text-ink">
            Catálogo
          </Link>
          <Link href="/pedidos">Mis pedidos</Link>
          <Link href="/tickets">Soporte</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/ingresar"
            className="flex h-11 items-center rounded-[10px] border border-line-strong px-4 text-sm font-medium text-ink"
          >
            Ingresar
          </Link>
          <Link
            href="/registro"
            className="flex h-11 items-center rounded-[10px] bg-ink px-4 text-sm font-medium text-white"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </header>
  );
}
