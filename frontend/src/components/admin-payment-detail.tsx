"use client";

import { useState } from "react";
import { Countdown } from "@/components/countdown";
import { formatPriceCents } from "@/lib/format";
import type { AdminPaymentView, PaymentRejectionReason } from "@/lib/admin-payments-client";

const REASONS: { value: PaymentRejectionReason; label: string }[] = [
  { value: "AMOUNT_MISMATCH", label: "Monto incorrecto" },
  { value: "ILLEGIBLE_PROOF", label: "Comprobante ilegible" },
  { value: "OPERATION_NOT_FOUND", label: "Operación no encontrada" },
];

export function AdminPaymentDetail({
  payment,
  rejecting,
  reason,
  submitting,
  onApprove,
  onStartReject,
  onCancelReject,
  onPickReason,
  onConfirmReject,
}: {
  payment: AdminPaymentView;
  rejecting: boolean;
  reason: PaymentRejectionReason | null;
  submitting: boolean;
  onApprove: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onPickReason: (reason: PaymentRejectionReason) => void;
  onConfirmReject: () => void;
}) {
  const [checks, setChecks] = useState({ amount: false, date: false, operation: false });
  const isPdf = payment.proofUrl.split("?")[0].toLowerCase().endsWith(".pdf");

  return (
    <section aria-label="Detalle del pago" className="flex-1 rounded-2xl border border-line-soft bg-surface p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl font-bold text-ink">{payment.customerName ?? payment.customerEmail}</p>
          <p className="text-sm text-muted">
            Pedido #{payment.orderNumber} · {payment.customerEmail}
          </p>
        </div>
        <div className="rounded-[10px] bg-warning-bg px-3 py-1 text-sm font-medium text-warning-ink">
          <Countdown expiresAt={payment.expiresAt} />
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="min-h-[280px] flex-1 basis-[220px]">
          {isPdf ? (
            <a
              href={payment.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-bg text-center text-sm font-medium text-accent"
            >
              Ver comprobante (PDF)
            </a>
          ) : (
            <div className="flex flex-col gap-2">
              <img
                src={payment.proofUrl}
                alt="Comprobante de pago"
                className="max-h-[280px] w-full rounded-xl border border-line-strong object-contain"
              />
              <a
                href={payment.proofUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center text-sm font-medium text-accent"
              >
                Ampliar imagen
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-1 basis-[260px] flex-col gap-4">
          <div className="flex flex-col gap-3">
            {payment.items.map((item) => (
              <div key={item.planId} className="rounded-[10px] bg-success-bg px-3 py-2">
                <p className="font-medium text-ink">
                  {item.productName} · {item.planName}
                </p>
                <p className="text-sm text-success-ink">Stock para entregar: quedan {item.availableStock} licencias</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm text-muted">Monto que debe aparecer</p>
            <p className="font-display text-2xl font-bold text-ink">
              {formatPriceCents(payment.totalCents, payment.currency)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Método</p>
            <p className="font-medium text-ink">{payment.paymentMethodName}</p>
          </div>
          <div>
            <p className="text-sm text-muted">N.º de operación</p>
            <p className="font-medium text-ink">{payment.operationNumber}</p>
          </div>
          <fieldset className="flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 font-medium text-ink">Verifica antes de aprobar</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={checks.amount}
                onChange={(e) => setChecks((c) => ({ ...c, amount: e.target.checked }))}
                className="h-5 w-5"
              />
              El monto coincide
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={checks.date}
                onChange={(e) => setChecks((c) => ({ ...c, date: e.target.checked }))}
                className="h-5 w-5"
              />
              La fecha es la de hoy
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={checks.operation}
                onChange={(e) => setChecks((c) => ({ ...c, operation: e.target.checked }))}
                className="h-5 w-5"
              />
              La operación no se repite
            </label>
          </fieldset>
        </div>
      </div>

      {rejecting ? (
        <div className="mt-6 border-t border-line-soft pt-5">
          <p className="mb-3 font-medium text-ink">Motivo del rechazo (se lo mostramos al cliente)</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={reason === r.value}
                onClick={() => onPickReason(r.value)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                  reason === r.value ? "border-danger-ink bg-danger-bg text-danger-ink" : "border-line-strong text-ink"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirmReject}
              disabled={!reason || submitting}
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
        <div className="mt-6 border-t border-line-soft pt-5">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onApprove}
              disabled={submitting}
              className="flex h-12 flex-1 items-center justify-center rounded-[10px] bg-success-ink px-6 text-base font-semibold text-white disabled:opacity-50"
            >
              Aprobar y entregar licencia
            </button>
            <button
              type="button"
              onClick={onStartReject}
              disabled={submitting}
              className="flex h-12 items-center justify-center rounded-[10px] border border-danger-ink px-6 text-base font-semibold text-danger-ink disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            Al aprobar, se asigna una licencia disponible, se envía por correo y pasas al siguiente pago.
          </p>
        </div>
      )}
    </section>
  );
}
