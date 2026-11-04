"use client";

import { useEffect, useState } from "react";

export function msRemaining(expiresAtIso: string, nowMs: number): number {
  return Math.max(0, new Date(expiresAtIso).getTime() - nowMs);
}

export function useCountdown(expiresAtIso: string): { remainingMs: number; expired: boolean } {
  const [remainingMs, setRemainingMs] = useState(() => msRemaining(expiresAtIso, Date.now()));

  useEffect(() => {
    setRemainingMs(msRemaining(expiresAtIso, Date.now()));
    const id = setInterval(() => {
      setRemainingMs(msRemaining(expiresAtIso, Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAtIso]);

  return { remainingMs, expired: remainingMs <= 0 };
}
