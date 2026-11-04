"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { formatPriceCents } from "@/lib/format";
import { saveOrderMeta } from "@/lib/order-meta";
import { createOrder, resendVerificationEmail } from "@/lib/orders-client";

export function CheckoutSummary() {
  const router = useRouter();
  const cart = useCart();
  const [toolUsername, setToolUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    setError(null);
    setNeedsVerification(false);
    setResendSent(false);
    if (cart.requiresToolUsername && toolUsername.trim().length === 0) {
      setError("Ingresa tu usuario de la herramienta para continuar");
      return;
    }

    setSubmitting(true);
    const result = await createOrder(
      cart.items.map((item) => ({ planId: item.planId, qty: item.qty })),
      cart.requiresToolUsername ? toolUsername.trim() : undefined,
    );
    setSubmitting(false);

    if (!result.ok) {
      if (result.status === 403) {
        setNeedsVerification(true);
      }
      setError(result.message);
      return;
    }

    saveOrderMeta(result.data.id, cart.items);
    cart.clear();
    router.push(`/checkout/${result.data.id}/pago`);
  }

  async function handleResend() {
    const result = await resendVerificationEmail();
    setResendSent(result.ok);
  }

  if (cart.items.length === 0) {
    return (
      <p className="text-sm text-muted">
        Tu carrito está vacío. <a href="/" className="text-accent underline">Vuelve al catálogo</a>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-line-soft rounded-2xl border border-line-soft bg-surface">
        {cart.items.map((item) => (
          <li key={item.planId} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-ink">{item.productName}</p>
              <p className="text-sm text-muted">
                {item.planName} · {item.qty} {item.qty === 1 ? "unidad" : "unidades"}
              </p>
            </div>
            <p className="font-medium text-ink">{formatPriceCents(item.unitPriceCents * item.qty, "PEN")}</p>
          </li>
        ))}
      </ul>

      <p className="text-right text-lg font-bold text-ink font-display">
        Total: {formatPriceCents(cart.totalCents, "PEN")}
      </p>

      {cart.requiresToolUsername ? (
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Usuario de la herramienta
          <input
            type="text"
            value={toolUsername}
            onChange={(e) => setToolUsername(e.target.value)}
            className="h-11 rounded-[10px] border border-line-strong px-3"
            required
          />
        </label>
      ) : null}

      {error ? (
        <div className="rounded-[10px] bg-danger-bg p-3 text-sm text-danger-ink">
          <p>{error}</p>
          {needsVerification ? (
            <button
              type="button"
              onClick={handleResend}
              className="mt-2 flex h-11 items-center font-medium underline disabled:opacity-50"
              disabled={resendSent}
            >
              {resendSent ? "Enlace reenviado, revisa tu correo" : "Reenviar enlace de verificación"}
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleContinue}
        disabled={submitting}
        className="flex h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Reservando…" : "Continuar a pago"}
      </button>
    </div>
  );
}
