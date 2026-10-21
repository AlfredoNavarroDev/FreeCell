import { describe, expect, it } from "vitest";
import { decodeJwtExpiry } from "./jwt-exp";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("decodeJwtExpiry", () => {
  it("devuelve el campo exp en milisegundos", () => {
    const expSeconds = 1_800_000_000;
    const token = makeJwt({ exp: expSeconds, sub: "user-1" });
    expect(decodeJwtExpiry(token)).toBe(expSeconds * 1000);
  });

  it("lanza si el token no tiene payload", () => {
    expect(() => decodeJwtExpiry("solo-un-segmento")).toThrow();
  });

  it("lanza si el payload no tiene exp", () => {
    const token = makeJwt({ sub: "user-1" });
    expect(() => decodeJwtExpiry(token)).toThrow();
  });
});
