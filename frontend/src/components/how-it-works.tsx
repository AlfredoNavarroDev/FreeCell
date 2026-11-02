const STEPS = [
  { n: 1, title: "Elegí la herramienta", body: "Buscá o filtrá por categoría y elegí el plan que necesitás." },
  { n: 2, title: "Pagá con el método que prefieras", body: "Yape, Plin o transferencia — vos elegís." },
  { n: 3, title: "Subí tu comprobante", body: "Capturá o fotografiá el pago y súbelo al pedido." },
  { n: 4, title: "Recibí tu clave", body: 'Validamos el pago y tu clave queda lista en "Mis pedidos".' },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <h2 className="font-display text-2xl font-bold text-ink">¿Cómo comprar?</h2>
      <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n} className="rounded-2xl border border-line-soft bg-surface p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
              {step.n}
            </span>
            <p className="font-display mt-3 text-base font-bold text-ink">{step.title}</p>
            <p className="mt-1 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
