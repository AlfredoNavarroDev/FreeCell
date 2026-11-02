import { describe, expect, it } from "vitest";
import { formatPriceCents } from "./format";

describe("formatPriceCents", () => {
  it("formatea céntimos en soles con dos decimales", () => {
    expect(formatPriceCents(8900, "PEN")).toBe("S/ 89.00");
  });

  it("formatea céntimos en dólares con dos decimales", () => {
    expect(formatPriceCents(1500, "USD")).toBe("$ 15.00");
  });

  it("usa soles por defecto si no se pasa moneda", () => {
    expect(formatPriceCents(100)).toBe("S/ 1.00");
  });
});
