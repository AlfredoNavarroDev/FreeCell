"use client";

import { useState } from "react";
import type { CatalogProductDetail } from "@/lib/catalog-client";

type TabKey = "description" | "activation" | "faq";

const TABS: { key: TabKey; label: string }[] = [
  { key: "description", label: "Descripción" },
  { key: "activation", label: "Cómo activar" },
  { key: "faq", label: "Preguntas" },
];

export function ProductTabs({ product }: { product: CatalogProductDetail }) {
  const [active, setActive] = useState<TabKey>("description");

  return (
    <div>
      <div className="flex gap-2 border-b border-line" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`min-h-11 border-b-2 px-4 text-sm font-medium ${
              active === tab.key ? "border-accent text-accent" : "border-transparent text-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="py-6 text-sm text-ink" role="tabpanel">
        {active === "description" ? (
          <div className="space-y-3">
            <p>{product.description ?? "Sin descripción todavía."}</p>
            {product.whatIncluded ? (
              <p>
                <span className="font-medium">Qué incluye:</span> {product.whatIncluded}
              </p>
            ) : null}
            {product.compatibility ? (
              <p>
                <span className="font-medium">Compatibilidad:</span> {product.compatibility}
              </p>
            ) : null}
          </div>
        ) : null}

        {active === "activation" ? (
          <p>{product.activationGuide ?? "Sin guía de activación todavía."}</p>
        ) : null}

        {active === "faq" ? (
          product.faq && product.faq.length > 0 ? (
            <dl className="space-y-4">
              {product.faq.map((entry) => (
                <div key={entry.question}>
                  <dt className="font-medium text-ink">{entry.question}</dt>
                  <dd className="text-muted">{entry.answer}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted">Sin preguntas frecuentes todavía.</p>
          )
        ) : null}
      </div>
    </div>
  );
}
