"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Countdown } from "@/components/countdown";
import { OrderItemsSummary } from "@/components/order-items-summary";
import type { PaymentMethod } from "@/lib/catalog-client";
import { computeProofHash } from "@/lib/proof-hash";
import { requestPaymentUploadUrl, submitPayment } from "@/lib/orders-client";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function PaymentForm({
  orderId,
  expiresAt,
  paymentMethods,
}: {
  orderId: string;
  expiresAt: string;
  paymentMethods: PaymentMethod[];
}) {
  const router = useRouter();
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [operationNumber, setOperationNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [acceptsLegalDeclaration, setAcceptsLegalDeclaration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  function handleFileChange(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(selected.type as (typeof ALLOWED_TYPES)[number])) {
      setError("El comprobante debe ser JPG, PNG o PDF");
      return;
    }
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError("El comprobante no puede superar 5 MB");
      return;
    }
    setFile(selected);
  }

  async function handleSubmit() {
    if (!paymentMethodId) {
      setError("No hay métodos de pago disponibles por ahora");
      return;
    }
    if (!file) {
      setError("Sube el comprobante de pago");
      return;
    }
    if (!acceptsLegalDeclaration) {
      setError("Debes aceptar la declaración de titularidad/autorización");
      return;
    }
    if (operationNumber.trim().length === 0) {
      setError("Ingresa el número de operación");
      return;
    }

    setSubmitting(true);
    setError(null);

    const uploadUrlResult = await requestPaymentUploadUrl(
      orderId,
      file.type as "image/jpeg" | "image/png" | "application/pdf",
      file.size,
    );
    if (!uploadUrlResult.ok) {
      setError(uploadUrlResult.message);
      setSubmitting(false);
      return;
    }

    const { uploadUrl, proofKey } = uploadUrlResult.data;
    const [uploadRes, proofHash] = await Promise.all([
      fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }),
      computeProofHash(file),
    ]);
    if (!uploadRes.ok) {
      setError("No pudimos subir el comprobante, intenta de nuevo");
      setSubmitting(false);
      return;
    }

    const paymentResult = await submitPayment(orderId, {
      paymentMethodId,
      proofKey,
      proofHash,
      operationNumber: operationNumber.trim(),
      acceptsLegalDeclaration,
    });
    setSubmitting(false);

    if (!paymentResult.ok) {
      setError(paymentResult.message);
      return;
    }

    router.push(`/checkout/${orderId}/entrega`);
  }

  return (
    <div className="flex flex-col gap-6">
      <Countdown expiresAt={expiresAt} onExpire={() => setExpired(true)} />
      <OrderItemsSummary orderId={orderId} />

      {expired ? (
        <div className="rounded-[10px] bg-danger-bg p-4 text-sm text-danger-ink">
          <p>La reserva de este pedido venció. Vuelve al catálogo para armar el pedido de nuevo.</p>
          <a href="/checkout" className="mt-2 inline-block font-medium underline">
            Volver al carrito
          </a>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Método de pago
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="h-11 rounded-[10px] border border-line-strong px-3"
            >
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            N.º de operación
            <input
              type="text"
              value={operationNumber}
              onChange={(e) => setOperationNumber(e.target.value)}
              className="h-11 rounded-[10px] border border-line-strong px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Comprobante (JPG, PNG o PDF, máx. 5 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="rounded-[10px] border border-line-strong px-3 py-2"
            />
          </label>

          <label className="flex min-h-11 items-start gap-3 py-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={acceptsLegalDeclaration}
              onChange={(e) => setAcceptsLegalDeclaration(e.target.checked)}
              className="mt-1 h-5 w-5"
            />
            Declaro ser propietario o técnico autorizado del equipo donde se usará esta licencia.
          </label>

          {error ? <p className="text-sm text-danger-ink">{error}</p> : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || paymentMethods.length === 0}
            className="flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Enviando…" : "Confirmar pago"}
          </button>
        </>
      )}
    </div>
  );
}
