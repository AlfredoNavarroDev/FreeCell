"use client";

import { useEffect, useRef, useState } from "react";
import { StockBadge } from "@/components/stock-badge";
import {
  createBatch,
  fetchAvailableLicenses,
  fetchInventory,
  previewBatch,
  updateUsdRate,
  voidLicense,
  type AvailableLicenseView,
  type BatchPreviewResultView,
  type InventoryItemView,
  type InventoryView,
} from "@/lib/inventory-client";

type Filter = "all" | "low" | "out";

function matchesFilter(item: InventoryItemView, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "low") return item.status === "LOW";
  return item.status === "OUT_OF_STOCK";
}

export function InventoryScreen({ initial }: { initial: InventoryView }) {
  const [items, setItems] = useState(initial.items);
  const [usdPenRate, setUsdPenRate] = useState(initial.usdPenRate);
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [licensesByPlan, setLicensesByPlan] = useState<Record<string, AvailableLicenseView[]>>({});
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");

  const [formPlanId, setFormPlanId] = useState(initial.items[0]?.planId ?? "");
  const [costCurrency, setCostCurrency] = useState<"PEN" | "USD">("PEN");
  const [costInput, setCostInput] = useState("");
  const [supplier, setSupplier] = useState("");
  const [secretsText, setSecretsText] = useState("");
  const [preview, setPreview] = useState<BatchPreviewResultView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const previewRequestRef = useRef(0);

  async function refetchInventory() {
    const result = await fetchInventory();
    if (result.ok) {
      setItems(result.data.items);
      setUsdPenRate(result.data.usdPenRate);
    }
  }

  useEffect(() => {
    const lines = secretsText.split("\n");
    if (!formPlanId || lines.every((l) => l.trim() === "")) {
      setPreview(null);
      return;
    }
    const timeout = setTimeout(async () => {
      const requestId = ++previewRequestRef.current;
      const result = await previewBatch(formPlanId, lines);
      if (requestId !== previewRequestRef.current) return;
      if (result.ok) {
        setPreview(result.data);
        setError(null);
      } else {
        setPreview(null);
        setError(result.message);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [formPlanId, secretsText]);

  async function refetchLicensesForPlan(planId: string) {
    const result = await fetchAvailableLicenses(planId);
    if (result.ok) {
      setLicensesByPlan((prev) => ({ ...prev, [planId]: result.data }));
    } else {
      setError(result.message);
    }
  }

  async function toggleExpand(planId: string) {
    if (expandedPlanId === planId) {
      setExpandedPlanId(null);
      return;
    }
    setExpandedPlanId(planId);
    setVoidingId(null);
    if (!licensesByPlan[planId]) {
      await refetchLicensesForPlan(planId);
    }
  }

  function startAdd(planId: string) {
    setFormPlanId(planId);
  }

  async function handleSaveRate() {
    const rate = Number(rateInput.replace(",", "."));
    if (!Number.isFinite(rate) || rate <= 0) {
      setError("La tasa debe ser un número mayor a 0");
      return;
    }
    const result = await updateUsdRate(rate);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setUsdPenRate(rate);
    setEditingRate(false);
    setError(null);
  }

  async function handleConfirmVoid(licenseId: string, planId: string) {
    const result = await voidLicense(licenseId, voidReason);
    if (!result.ok) {
      setError(result.message);
      const refreshed = await fetchAvailableLicenses(planId);
      if (refreshed.ok) setLicensesByPlan((prev) => ({ ...prev, [planId]: refreshed.data }));
      await refetchInventory();
      return;
    }
    setLicensesByPlan((prev) => ({
      ...prev,
      [planId]: (prev[planId] ?? []).filter((l) => l.id !== licenseId),
    }));
    setVoidingId(null);
    setVoidReason("");
    setError(null);
    await refetchInventory();
  }

  async function handleCreateBatch() {
    const costCents = Math.round(Number(costInput.replace(",", ".")) * 100);
    if (!formPlanId || !Number.isFinite(costCents) || costCents <= 0) {
      setError("Completa el plan y un costo válido antes de cargar");
      return;
    }
    const secrets = secretsText.split("\n");
    setSubmitting(true);
    setError(null);
    const result = await createBatch({
      planId: formPlanId,
      costCurrency,
      unitCostCents: costCents,
      supplier: supplier.trim() || undefined,
      secrets,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const planName = items.find((i) => i.planId === formPlanId)?.planName ?? "";
    const { loadedCount, duplicateCount, errorCount } = result.data;
    const skippedParts = [
      duplicateCount > 0 ? `${duplicateCount} duplicadas` : null,
      errorCount > 0 ? `${errorCount} con error` : null,
    ].filter((part): part is string => part !== null);
    const skippedSuffix = skippedParts.length > 0 ? ` (${skippedParts.join(", ")}, omitidas)` : "";
    setCostInput("");
    setSupplier("");
    setSecretsText("");
    setPreview(null);
    setLicensesByPlan((prev) => {
      const next = { ...prev };
      delete next[formPlanId];
      return next;
    });
    setMessage(`${loadedCount} licencias cargadas a ${planName}${skippedSuffix}.`);
    if (expandedPlanId === formPlanId) {
      await refetchLicensesForPlan(formPlanId);
    }
    await refetchInventory();
  }

  const totals = items.reduce(
    (acc, item) => ({
      available: acc.available + item.available,
      reserved: acc.reserved + item.reserved,
      sold: acc.sold + item.sold,
    }),
    { available: 0, reserved: 0, sold: 0 },
  );
  const visibleItems = items.filter((item) => matchesFilter(item, filter));

  return (
    <div className="flex flex-col gap-5">
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="rounded-2xl border border-line-soft bg-surface p-4">
          <p className="text-sm text-muted">Disponibles</p>
          <p className="font-display text-2xl font-bold text-ink">{totals.available}</p>
        </div>
        <div className="rounded-2xl border border-line-soft bg-surface p-4">
          <p className="text-sm text-muted">Reservadas</p>
          <p className="font-display text-2xl font-bold text-ink">{totals.reserved}</p>
        </div>
        <div className="rounded-2xl border border-line-soft bg-surface p-4">
          <p className="text-sm text-muted">Vendidas</p>
          <p className="font-display text-2xl font-bold text-ink">{totals.sold}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { id: "all", label: "Todos" },
          { id: "low", label: "Stock bajo" },
          { id: "out", label: "Agotados" },
        ] as const).map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
              filter === f.id ? "border-ink bg-ink text-white" : "border-line-strong text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Stock por plan" className="flex-1 basis-[480px] overflow-hidden rounded-2xl border border-line-soft bg-surface">
          {visibleItems.length === 0 ? (
            <p className="p-10 text-center text-muted">Ningún plan en esta categoría.</p>
          ) : (
            visibleItems.map((item) => (
              <div key={item.planId} className="border-b border-line-soft last:border-b-0">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.planId)}
                    className="flex min-h-11 flex-1 basis-[200px] flex-col items-start text-left"
                  >
                    <span className="font-semibold text-ink">
                      {item.productName} · {item.planName}
                    </span>
                    <span className="text-sm text-muted">Alerta cuando queden menos de {item.lowStockThreshold}</span>
                  </button>
                  <span className="text-sm text-muted">{item.available} disponibles</span>
                  <StockBadge state={item.status} />
                  <a
                    href="#cargar-licencias"
                    onClick={() => startAdd(item.planId)}
                    className="flex min-h-11 items-center px-3 text-sm font-semibold text-accent"
                  >
                    + Agregar
                  </a>
                </div>
                {expandedPlanId === item.planId ? (
                  <div className="flex flex-col gap-2 border-t border-line-soft bg-bg px-5 py-4">
                    {licensesByPlan[item.planId] === undefined ? (
                      <p className="text-sm text-muted">No se pudo cargar. Intenta de nuevo.</p>
                    ) : licensesByPlan[item.planId]!.length === 0 ? (
                      <p className="text-sm text-muted">Sin licencias disponibles para expandir.</p>
                    ) : (
                      licensesByPlan[item.planId]!.map((license) => (
                        <div key={license.id} className="flex flex-wrap items-center gap-3 rounded-[10px] bg-surface px-3 py-2">
                          <span className="flex-1 text-sm text-muted">
                            Cargada el {new Date(license.createdAt).toLocaleDateString("es-PE")}
                          </span>
                          {voidingId === license.id ? (
                            <>
                              <input
                                type="text"
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="Motivo de la anulación"
                                className="min-h-11 flex-1 basis-[180px] rounded-[10px] border border-line-strong px-3 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => handleConfirmVoid(license.id, item.planId)}
                                disabled={!voidReason.trim()}
                                className="min-h-11 rounded-[10px] bg-danger-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setVoidingId(null);
                                  setVoidReason("");
                                }}
                                className="min-h-11 rounded-[10px] border border-line-strong px-4 text-sm font-semibold text-ink"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setVoidingId(license.id);
                                setVoidReason("");
                              }}
                              className="min-h-11 rounded-[10px] border border-danger-ink px-4 text-sm font-semibold text-danger-ink"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </section>

        <section id="cargar-licencias" aria-label="Cargar licencias" className="w-full max-w-[420px] rounded-2xl border border-line-soft bg-surface p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-ink">Cargar licencias</h2>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Plan</span>
              <select
                value={formPlanId}
                onChange={(e) => setFormPlanId(e.target.value)}
                aria-label="Plan"
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              >
                {items.map((item) => (
                  <option key={item.planId} value={item.planId}>
                    {item.productName} · {item.planName}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Moneda del costo</span>
              <select
                value={costCurrency}
                onChange={(e) => setCostCurrency(e.target.value as "PEN" | "USD")}
                aria-label="Moneda del costo"
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              >
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </select>
            </label>

            {costCurrency === "USD" ? (
              <div className="rounded-[10px] bg-bg px-3 py-2 text-sm">
                {editingRate ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="min-h-11 w-28 rounded-[10px] border border-line-strong px-3"
                    />
                    <button type="button" onClick={handleSaveRate} className="min-h-11 rounded-[10px] bg-accent px-3 font-semibold text-white">
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditingRate(false)} className="min-h-11 rounded-[10px] border border-line-strong px-3">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <span>
                    Tasa USD→PEN actual: {usdPenRate !== null ? `S/ ${usdPenRate.toFixed(2)}` : "sin configurar"}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setRateInput(usdPenRate !== null ? String(usdPenRate) : "");
                        setEditingRate(true);
                      }}
                      className="font-semibold text-accent"
                    >
                      Editar
                    </button>
                  </span>
                )}
              </div>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Costo por licencia ({costCurrency})</span>
              <input
                type="text"
                inputMode="decimal"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Proveedor (opcional)</span>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="min-h-11 rounded-[10px] border border-line-strong px-3"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Pega una licencia por línea</span>
              <textarea
                rows={6}
                value={secretsText}
                onChange={(e) => setSecretsText(e.target.value)}
                className="rounded-[10px] border border-line-strong px-3 py-2"
              />
            </label>

            {preview ? (
              <div className="flex flex-col gap-1 rounded-[10px] bg-bg px-4 py-3 text-sm">
                <span className="font-semibold text-success-ink">{preview.validCount} válidas</span>
                <span className="font-semibold text-warning-ink">{preview.duplicateCount} duplicadas (se omiten)</span>
                <span className="font-semibold text-danger-ink">{preview.errorCount} con error</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleCreateBatch}
              disabled={submitting}
              className="min-h-12 rounded-[10px] bg-accent px-6 font-semibold text-white disabled:opacity-50"
            >
              Cargar al inventario
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
