import { describe, expect, it } from "vitest";
import { formatRating } from "./rating";

describe("formatRating", () => {
  it("enteros sin decimales", () => {
    expect(formatRating(4)).toBe("4");
    expect(formatRating(5)).toBe("5");
  });

  it("promedios con un decimal", () => {
    expect(formatRating(4.5)).toBe("4.5");
    expect(formatRating(4.333)).toBe("4.3");
  });
});
