import { describe, expect, it } from "vitest";
import { msRemaining } from "./use-countdown";

describe("msRemaining", () => {
  it("devuelve el tiempo restante en milisegundos", () => {
    const expiresAt = new Date("2026-11-03T15:30:00.000Z").toISOString();
    const now = new Date("2026-11-03T15:00:00.000Z").getTime();

    expect(msRemaining(expiresAt, now)).toBe(30 * 60_000);
  });

  it("nunca devuelve negativo (clampea a 0 si ya venció)", () => {
    const expiresAt = new Date("2026-11-03T15:00:00.000Z").toISOString();
    const now = new Date("2026-11-03T15:30:00.000Z").getTime();

    expect(msRemaining(expiresAt, now)).toBe(0);
  });
});
