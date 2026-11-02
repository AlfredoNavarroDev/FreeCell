interface TrustStatsProps {
  totalProducts: number;
}

export function TrustStats({ totalProducts }: TrustStatsProps) {
  const stats = [
    { title: "Entrega rápida", body: 'Tu clave queda en "Mis pedidos" al aprobarse el pago.' },
    { title: "Reposición garantizada", body: "Si tu clave falla, la repones dentro de 7 días." },
    { title: "Soporte real", body: "Tickets de soporte y reclamos atendidos por el equipo." },
    { title: `${totalProducts} herramientas`, body: "Catálogo activo, con nuevas licencias cada semana." },
  ];

  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <li key={stat.title} className="rounded-2xl border border-line-soft bg-surface p-5">
            <p className="font-display text-base font-bold text-ink">{stat.title}</p>
            <p className="mt-1 text-sm text-muted">{stat.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
