import { describe, expect, it } from "vitest";
import { login, refreshTokens } from "./api-client";

describe.runIf(process.env.RUN_INTEGRATION_TESTS === "1")("refreshTokens (contra backend real)", () => {
  it("devuelve un par nuevo cuando el refresh token es válido", async () => {
    const email = `e2e-refresh-${Date.now()}@freecell.test`;
    const password = "Contrasena#123";
    await fetch(`${process.env.API_URL ?? "http://localhost:3000"}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Cliente E2E" }),
    });

    const loginResult = await login(email, password);
    expect(loginResult).not.toBeNull();

    // El access token del backend se firma con granularidad de segundos (`iat` en segundos,
    // sin `jti`); sin esta espera, login + refresh dentro del mismo segundo producirían un
    // JWT byte-idéntico (mismo payload sub/role/iat/exp) y la aserción de abajo sería un falso
    // negativo pese a que el refresco sí ocurrió (el refreshToken rotado sí cambia siempre).
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const refreshed = await refreshTokens(loginResult!.refreshToken);

    expect(refreshed).not.toBeNull();
    expect(refreshed!.accessToken).not.toBe(loginResult!.accessToken);
  });

  it("devuelve null cuando el refresh token es inválido", async () => {
    const refreshed = await refreshTokens("token-que-no-existe");
    expect(refreshed).toBeNull();
  });
});
