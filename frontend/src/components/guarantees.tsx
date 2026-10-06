const GUARANTEES = [
  { title: "Entrega rápida", body: "Tu clave queda en \"Mis pedidos\" al aprobarse el pago." },
  { title: "Pagos conocidos", body: "Yape, Plin o transferencia, con comprobante." },
  { title: "Reposición", body: "Clave inválida: reposición dentro de 7 días." },
  { title: "Soporte", body: "Tickets de soporte y reclamos atendidos por el equipo." },
];

export function Guarantees() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GUARANTEES.map((g) => (
          <li
            key={g.title}
            className="rounded-2xl border border-line-soft bg-surface p-5"
          >
            <p className="font-display text-base font-bold text-ink">{g.title}</p>
            <p className="mt-1 text-sm text-muted">{g.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
