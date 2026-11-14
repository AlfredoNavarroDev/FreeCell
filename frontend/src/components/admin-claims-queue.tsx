"use client";

import { useState } from "react";
import { AdminClaimDetail } from "@/components/admin-claim-detail";
import {
  fetchAdminClaims,
  rejectClaim,
  replaceClaim,
  type AdminClaimView,
} from "@/lib/claims-admin-client";

export function AdminClaimsQueue({ initialClaims }: { initialClaims: AdminClaimView[] }) {
  const [claims, setClaims] = useState(initialClaims);
  const [selectedId, setSelectedId] = useState<string | null>(initialClaims[0]?.claimId ?? null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = claims.find((c) => c.claimId === selectedId) ?? null;

  function selectClaim(claimId: string) {
    setSelectedId(claimId);
    setRejecting(false);
    setReason("");
    setError(null);
  }

  async function refetchQueue(): Promise<AdminClaimView[]> {
    const result = await fetchAdminClaims("OPEN");
    if (!result.ok) {
      setError(result.message);
      return claims;
    }
    setClaims(result.data.items);
    return result.data.items;
  }

  async function handleReplace() {
    if (!selected) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    const result = await replaceClaim(selected.claimId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      await refetchQueue();
      return;
    }
    const fresh = await refetchQueue();
    setSelectedId(fresh[0]?.claimId ?? null);
    setRejecting(false);
    setReason("");
    setMessage(`Reclamo del pedido #${result.data.orderNumber} resuelto. Reemplazo entregado.`);
  }

  async function handleConfirmReject() {
    if (!selected || reason.trim().length < 3) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    const result = await rejectClaim(selected.claimId, reason.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      await refetchQueue();
      return;
    }
    const fresh = await refetchQueue();
    setSelectedId(fresh[0]?.claimId ?? null);
    setRejecting(false);
    setReason("");
    setMessage(`Reclamo del pedido #${result.data.orderNumber} rechazado.`);
  }

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}
      {claims.length === 0 ? (
        <div className="rounded-2xl border border-line-soft bg-surface p-14 text-center">
          <p className="font-display text-xl font-bold text-ink">Sin reclamos abiertos</p>
          <p className="mt-1 text-muted">Cuando un cliente reporte una clave inválida, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <p className="text-muted">{claims.length} abiertos</p>
          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Cola de reclamos" className="flex w-full max-w-[360px] flex-col gap-2">
              {claims.map((c) => {
                const active = c.claimId === selectedId;
                return (
                  <button
                    key={c.claimId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectClaim(c.claimId)}
                    className={`flex flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left ${
                      active ? "border-accent bg-accent-soft-bg" : "border-line-soft bg-surface"
                    }`}
                  >
                    <span className="font-semibold text-ink">{c.customerName ?? c.customerEmail}</span>
                    <span className="text-sm text-muted">
                      {c.productName} · {c.planName}
                    </span>
                    <span className="text-sm text-muted">Pedido #{c.orderNumber}</span>
                  </button>
                );
              })}
            </section>
            {selected ? (
              <AdminClaimDetail
                key={selected.claimId}
                claim={selected}
                rejecting={rejecting}
                reason={reason}
                submitting={submitting}
                onReplace={handleReplace}
                onStartReject={() => setRejecting(true)}
                onCancelReject={() => {
                  setRejecting(false);
                  setReason("");
                }}
                onReasonChange={setReason}
                onConfirmReject={handleConfirmReject}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
