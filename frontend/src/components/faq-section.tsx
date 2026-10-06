const FAQS = [
  {
    q: "¿Cómo recibo mi licencia?",
    a: "Al aprobarse tu pago, la clave queda disponible en \"Mis pedidos\" y te avisamos por correo con un enlace (nunca enviamos la clave completa por correo).",
  },
  {
    q: "¿Qué pasa si mi clave no funciona?",
    a: "Tienes 7 días desde la entrega para reportarlo. Hacemos una reposición (máximo una por pedido).",
  },
  {
    q: "¿Qué métodos de pago aceptan?",
    a: "Yape, Plin o transferencia bancaria, con comprobante y número de operación.",
  },
];

export function FaqSection() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <h2 className="font-display text-2xl font-bold text-ink">Preguntas frecuentes</h2>
      <dl className="mt-4 divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
        {FAQS.map((item) => (
          <div key={item.q} className="p-5">
            <dt className="font-medium text-ink">{item.q}</dt>
            <dd className="mt-1 text-sm text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
