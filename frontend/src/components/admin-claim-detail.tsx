"use client";

import type { AdminClaimView } from "@/lib/claims-admin-client";

export function AdminClaimDetail({
  claim,
  rejecting,
  reason,
  submitting,
  onReplace,
  onStartReject,
  onCancelReject,
  onReasonChange,
  onConfirmReject,
}: {
  claim: AdminClaimView;
  rejecting: boolean;
  reason: string;
  submitting: boolean;
  onReplace: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onReasonChange: (reason: string) => void;
  onConfirmReject: () => void;
}) {
  return (
    <section aria-label="Detalle del reclamo" className="flex-1 rounded-2xl border border-line-soft bg-surface p-6">
      <div className="mb-5">
        <p className="font-display text-xl font-bold text-ink">{claim.customerName ?? claim.customerEmail}</p>
        <p className="text-sm text-muted">
          Pedido #{claim.orderNumber} · {claim.productName} · {claim.planName}
        </p>
      </div>

      <div className="mb-5 rounded-[10px] bg-bg px-4 py-3">
        <p className="text-sm text-muted">Lo que dice el cliente</p>
        <p className="text-ink">{claim.reason}</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-5">
        <div>
          <p className="text-sm text-muted">Clave entregada</p>
          <p className="font-mono text-lg font-semibold tracking-wide text-ink">••••-••••-••••-••••</p>
        </div>
        <div>
          <p className="text-sm text-muted">Stock para reponer</p>
          <p
            className={`inline-block rounded-[10px] px-3 py-1 font-semibold ${
              claim.availableStock > 0 ? "bg-success-bg text-success-ink" : "bg-danger-bg text-danger-ink"
            }`}
          >
            Quedan {claim.availableStock} licencias
          </p>
        </div>
      </div>

      {rejecting ? (
        <div className="border-t border-line-soft pt-5">
          <label className="mb-2 block font-medium text-ink" htmlFor="reject-reason">
            Motivo del rechazo
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            className="mb-4 w-full rounded-[10px] border border-line-strong p-3 text-sm text-ink"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirmReject}
              disabled={reason.trim().length < 3 || submitting}
              className="flex h-12 items-center justify-center rounded-[10px] bg-danger-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirmar rechazo
            </button>
            <button
              type="button"
              onClick={onCancelReject}
              disabled={submitting}
              className="flex h-12 items-center justify-center rounded-[10px] border border-line-strong px-6 text-sm font-semibold text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 border-t border-line-soft pt-5">
          <button
            type="button"
            onClick={onReplace}
            disabled={submitting}
            className="flex h-12 flex-1 items-center justify-center rounded-[10px] bg-success-ink px-6 text-base font-semibold text-white disabled:opacity-50"
          >
            Entregar reemplazo
          </button>
          <button
            type="button"
            onClick={onStartReject}
            disabled={submitting}
            className="flex h-12 items-center justify-center rounded-[10px] border border-danger-ink px-6 text-base font-semibold text-danger-ink disabled:opacity-50"
          >
            Rechazar reclamo
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Hola, te escribimos por tu reclamo del pedido #${claim.orderNumber}`)}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center rounded-[10px] border border-line-strong px-6 text-base font-semibold text-ink"
          >
            Escribir por WhatsApp
          </a>
        </div>
      )}
      <p className="mt-3 text-sm text-muted">
        Al entregar el reemplazo, la clave original se marca como inválida y el cliente la ve en Mis pedidos.
      </p>
    </section>
  );
}
