"use client";

import { useState } from "react";
import { AdminPaymentDetail } from "@/components/admin-payment-detail";
import {
  approvePayment,
  fetchAdminPayments,
  rejectPayment,
  type AdminPaymentView,
  type PaymentRejectionReason,
} from "@/lib/admin-payments-client";
import { formatPriceCents } from "@/lib/format";

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function AdminPaymentsQueue({ initialPayments }: { initialPayments: AdminPaymentView[] }) {
  const [payments, setPayments] = useState(initialPayments);
  const [selectedId, setSelectedId] = useState<string | null>(initialPayments[0]?.paymentId ?? null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<PaymentRejectionReason | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = payments.find((p) => p.paymentId === selectedId) ?? null;

  function selectPayment(paymentId: string) {
    setSelectedId(paymentId);
    setRejecting(false);
    setReason(null);
    setError(null);
  }

  async function refetchQueue(): Promise<AdminPaymentView[]> {
    const result = await fetchAdminPayments("PENDING");
    if (!result.ok) {
      setError(result.message);
      return payments;
    }
    setPayments(result.data.items);
    return result.data.items;
  }

  async function handleApprove() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const result = await approvePayment(selected.paymentId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      await refetchQueue();
      return;
    }
    const fresh = await refetchQueue();
    setSelectedId(fresh[0]?.paymentId ?? null);
    setRejecting(false);
    setReason(null);
    setMessage(`Pedido #${result.data.orderNumber} aprobado. Licencia asignada y correo en cola.`);
  }

  async function handleConfirmReject() {
    if (!selected || !reason) return;
    setSubmitting(true);
    setError(null);
    const result = await rejectPayment(selected.paymentId, reason);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      await refetchQueue();
      return;
    }
    const fresh = await refetchQueue();
    setSelectedId(fresh[0]?.paymentId ?? null);
    setRejecting(false);
    setReason(null);
    setMessage(`Pedido #${result.data.orderNumber} rechazado.`);
  }

  if (payments.length === 0) {
    return (
      <div className="rounded-2xl border border-line-soft bg-surface p-14 text-center">
        <p className="font-display text-xl font-bold text-ink">Estás al día</p>
        <p className="mt-1 text-muted">No hay pagos pendientes. Cuando un cliente suba un comprobante, aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{payments.length} pendientes</p>
      {message ? (
        <div className="rounded-[10px] bg-success-bg px-4 py-3 font-medium text-success-ink">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-[10px] bg-danger-bg px-4 py-3 font-medium text-danger-ink">{error}</div>
      ) : null}
      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Cola de pagos" className="flex w-full max-w-[360px] flex-col gap-2">
          {payments.map((p) => {
            const active = p.paymentId === selectedId;
            return (
              <button
                key={p.paymentId}
                type="button"
                aria-pressed={active}
                onClick={() => selectPayment(p.paymentId)}
                className={`flex flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left ${
                  active ? "border-accent bg-accent-soft-bg" : "border-line-soft bg-surface"
                }`}
              >
                <span className="flex w-full justify-between gap-2 font-semibold text-ink">
                  <span>{p.customerName ?? p.customerEmail}</span>
                  <span>{formatPriceCents(p.totalCents, p.currency)}</span>
                </span>
                <span className="text-sm text-muted">
                  {p.items.map((item) => `${item.productName} · ${item.planName}`).join(", ")}
                </span>
                <span className="text-sm text-muted">
                  {p.paymentMethodName} · hace {minutesAgo(p.createdAt)} min
                </span>
              </button>
            );
          })}
        </section>
        {selected ? (
          <AdminPaymentDetail
            key={selected.paymentId}
            payment={selected}
            rejecting={rejecting}
            reason={reason}
            submitting={submitting}
            onApprove={handleApprove}
            onStartReject={() => setRejecting(true)}
            onCancelReject={() => {
              setRejecting(false);
              setReason(null);
            }}
            onPickReason={setReason}
            onConfirmReject={handleConfirmReject}
          />
        ) : null}
      </div>
    </div>
  );
}
