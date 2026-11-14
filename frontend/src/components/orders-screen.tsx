"use client";

import { useState } from "react";
import { createClaim, type ClaimView } from "@/lib/claims-client";
import { formatPriceCents } from "@/lib/format";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, ORDER_TABS, matchesTab, type OrderTab } from "@/lib/order-status";
import { revealLicense, type OrderView, type RevealedLicenseView } from "@/lib/orders-client";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

function TrackingStep({ label, at, done }: { label: string; at: string | null; done: boolean }) {
  return (
    <div className="flex gap-3">
      <div
        className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-success-ink text-white" : "border border-line-strong text-muted"
        }`}
        aria-hidden="true"
      >
        {done ? "✓" : ""}
      </div>
      <div>
        <div className="font-medium text-ink">{label}</div>
        <div className="text-sm text-muted">{at ? formatDate(at) : "Pendiente"}</div>
      </div>
    </div>
  );
}

function ClaimSection({
  order,
  claim,
  onClaimCreated,
}: {
  order: OrderView;
  claim: ClaimView | null;
  onClaimCreated: (claim: ClaimView) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [orderItemId, setOrderItemId] = useState(order.items[0]?.orderItemId ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await createClaim(order.id, orderItemId, reason.trim());
    setSubmitting(false);
    if (result.ok) {
      onClaimCreated(result.data);
      setReporting(false);
      setReason("");
    } else {
      setError(result.message);
    }
  }

  if (claim?.status === "OPEN") {
    return (
      <div className="mt-4 rounded-xl bg-accent-soft-bg p-4 text-sm text-accent-soft-ink">
        Tu reclamo está en revisión. Te avisamos cuando lo resolvamos.
      </div>
    );
  }

  if (claim?.status === "RESOLVED") {
    return <p className="mt-4 text-sm text-muted">Ya se entregó una reposición para este pedido.</p>;
  }

  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      {claim?.status === "REJECTED" && (
        <p className="mb-3 text-sm text-danger-ink">
          Tu reclamo anterior fue rechazado{claim.rejectionReason ? `: ${claim.rejectionReason}` : "."}
        </p>
      )}
      {!reporting ? (
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="flex h-11 items-center text-sm font-semibold text-danger-ink"
        >
          Reportar un problema
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {order.items.length > 1 && (
            <select
              value={orderItemId}
              onChange={(e) => setOrderItemId(e.target.value)}
              className="h-11 rounded-[10px] border border-line-strong px-3 text-sm text-ink"
            >
              {order.items.map((item, i) => (
                <option key={item.orderItemId} value={item.orderItemId}>
                  {item.productName} · {item.planName} (#{i + 1})
                </option>
              ))}
            </select>
          )}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contanos qué pasó con la clave"
            rows={3}
            className="rounded-[10px] border border-line-strong p-3 text-sm text-ink"
          />
          {error && <p className="text-sm text-danger-ink">{error}</p>}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || reason.trim().length < 3}
              className="flex h-11 items-center rounded-[10px] bg-danger-ink px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Enviando…" : "Enviar reclamo"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReporting(false);
                setError(null);
              }}
              className="flex h-11 items-center rounded-[10px] border border-line-strong px-5 text-sm font-semibold text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderDetailPanel({
  order,
  claim,
  onClaimCreated,
}: {
  order: OrderView;
  claim: ClaimView | null;
  onClaimCreated: (claim: ClaimView) => void;
}) {
  const [revealed, setRevealed] = useState<RevealedLicenseView[] | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  async function handleToggle() {
    if (revealed) {
      setShowKeys((prev) => !prev);
      return;
    }
    setRevealing(true);
    setRevealError(null);
    const result = await revealLicense(order.id);
    setRevealing(false);
    if (result.ok) {
      setRevealed(result.data);
      setShowKeys(true);
    } else {
      setRevealError(result.message);
    }
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.map((lic) => lic.secret).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard sin permiso: no es crítico, el usuario puede seleccionar el texto a mano.
    }
  }

  const planLabel = (planId: string) =>
    order.items.find((item) => item.planId === planId) ?? { productName: "", planName: "" };

  return (
    <aside className="w-full flex-1 rounded-2xl border border-line-soft bg-surface p-6" style={{ maxWidth: 460 }}>
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_BADGE[order.status]}`}
      >
        {ORDER_STATUS_LABEL[order.status]}
      </span>
      <h2 className="mt-3 font-display text-xl font-bold text-ink">
        {order.items.map((item) => `${item.productName} · ${item.planName}`).join(", ")}
      </h2>
      <div className="mb-5 text-sm text-muted">
        Pedido #{order.orderNumber} · {formatPriceCents(order.totalCents, order.currency)}
      </div>

      {order.status === "DELIVERED" && (
        <div className="mb-2">
          <div className="mb-1.5 text-sm text-muted">
            {order.items.length > 1 ? "Tus claves de licencia" : "Tu clave de licencia"}
          </div>
          <div className="flex flex-col gap-2">
            {(revealed ?? order.items.map((item, i) => ({ orderItemId: String(i), planId: item.planId, secret: "" }))).map(
              (lic) => (
                <div key={lic.orderItemId} className="rounded-xl bg-bg p-3">
                  {order.items.length > 1 && (
                    <div className="mb-1 text-xs font-medium text-muted">
                      {planLabel(lic.planId).productName} · {planLabel(lic.planId).planName}
                    </div>
                  )}
                  <div className="break-all font-mono text-lg font-semibold tracking-wide text-ink">
                    {revealed && showKeys ? lic.secret : "••••-••••-••••-••••"}
                  </div>
                </div>
              ),
            )}
          </div>
          {revealError && <p className="mt-2 text-sm text-danger-ink">{revealError}</p>}
          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              onClick={handleToggle}
              disabled={revealing}
              className="flex h-11 items-center rounded-[10px] border border-line-strong px-5 text-sm font-semibold text-ink disabled:opacity-60"
            >
              {revealing ? "Cargando…" : showKeys ? "Ocultar" : "Mostrar"}
            </button>
            {revealed && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            )}
          </div>
          <ClaimSection key={order.id} order={order} claim={claim} onClaimCreated={onClaimCreated} />
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-line-soft pt-5">
        <div className="font-semibold text-ink">Seguimiento</div>
        <TrackingStep label="Pedido creado" at={order.tracking.createdAt} done />
        <TrackingStep
          label="Pago aprobado"
          at={order.tracking.paymentApprovedAt}
          done={order.tracking.paymentApprovedAt !== null}
        />
        <TrackingStep
          label="Licencia entregada"
          at={order.tracking.deliveredAt}
          done={order.tracking.deliveredAt !== null}
        />
      </div>
      {order.cancelReason && <p className="mt-4 text-sm text-danger-ink">Motivo de cancelación: {order.cancelReason}</p>}
    </aside>
  );
}

export function OrdersScreen({ initial, initialClaims }: { initial: OrderView[]; initialClaims: ClaimView[] }) {
  const [tab, setTab] = useState<OrderTab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [claims, setClaims] = useState(initialClaims);

  const filtered = initial.filter((order) => matchesTab(order.status, tab));
  const selected = filtered.find((order) => order.id === selectedId) ?? filtered[0] ?? null;
  const claimForSelected = selected
    ? claims.filter((c) => c.orderId === selected.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    : null;

  function selectTab(nextTab: OrderTab) {
    setTab(nextTab);
    setSelectedId(null);
  }

  function handleClaimCreated(claim: ClaimView) {
    setClaims((prev) => [claim, ...prev]);
  }

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-bold text-ink">Mis pedidos</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {ORDER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex h-11 items-center rounded-full border px-4 text-sm font-medium ${
              tab === t.id ? "border-ink bg-ink text-white" : "border-line-strong text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-line-soft bg-surface p-10 text-center text-muted">
              No tienes pedidos en esta categoría.
            </div>
          )}
          {filtered.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedId(order.id)}
              aria-pressed={selected?.id === order.id}
              className={`flex items-center gap-5 rounded-2xl border bg-surface p-5 text-left ${
                selected?.id === order.id ? "border-ink" : "border-line-soft"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">
                  {order.items.map((item) => `${item.productName} · ${item.planName}`).join(", ")}
                </div>
                <div className="text-sm text-muted">
                  Pedido #{order.orderNumber} · {formatDate(order.tracking.createdAt)}
                </div>
              </div>
              <div className="font-medium text-ink">{formatPriceCents(order.totalCents, order.currency)}</div>
              <span
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${ORDER_STATUS_BADGE[order.status]}`}
              >
                {ORDER_STATUS_LABEL[order.status]}
              </span>
            </button>
          ))}
        </section>

        {selected && (
          <OrderDetailPanel order={selected} claim={claimForSelected} onClaimCreated={handleClaimCreated} />
        )}
      </div>
    </div>
  );
}
