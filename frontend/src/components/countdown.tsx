"use client";

import { useEffect } from "react";
import { useCountdown } from "@/lib/use-countdown";

export function Countdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire?: () => void;
}) {
  const { remainingMs, expired } = useCountdown(expiresAt);

  useEffect(() => {
    if (expired) onExpire?.();
  }, [expired, onExpire]);

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);

  return (
    <p
      className={`text-sm font-medium ${expired ? "text-danger-ink" : "text-ink"}`}
      role="timer"
      aria-live="polite"
    >
      {expired ? "Reserva vencida" : `Reserva vigente: ${minutes}:${String(seconds).padStart(2, "0")}`}
    </p>
  );
}
