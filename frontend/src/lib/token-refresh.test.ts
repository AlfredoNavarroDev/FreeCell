import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./api-client";
import { applyRefreshIfNeeded, needsRefresh, type RefreshableToken } from "./token-refresh";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("needsRefresh", () => {
  it("es falso si falta accessTokenExpiresAt", () => {
    expect(needsRefresh(undefined, Date.now())).toBe(false);
  });

  it("es falso si todavía falta más que el buffer (60s)", () => {
    const now = 1_000_000;
    expect(needsRefresh(now + 120_000, now)).toBe(false);
  });

  it("es verdadero dentro del buffer de 60s antes de expirar", () => {
    const now = 1_000_000;
    expect(needsRefresh(now + 30_000, now)).toBe(true);
  });

  it("es verdadero si ya expiró", () => {
    const now = 1_000_000;
    expect(needsRefresh(now - 1, now)).toBe(true);
  });
});

describe("applyRefreshIfNeeded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no hace nada si todavía no hace falta refrescar", async () => {
    const refreshSpy = vi.spyOn(apiClient, "refreshTokens");
    const now = 1_000_000;
    const token = { accessToken: "a", refreshToken: "r", accessTokenExpiresAt: now + 120_000 };

    const result = await applyRefreshIfNeeded(token, now);

    expect(result).toEqual(token);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("rota el par cuando el backend responde ok", async () => {
    const now = 1_000_000;
    const newAccessToken = makeJwt({ exp: Math.floor((now + 900_000) / 1000) });
    vi.spyOn(apiClient, "refreshTokens").mockResolvedValue({
      accessToken: newAccessToken,
      refreshToken: "nuevo-refresh",
    });
    const token: RefreshableToken = {
      accessToken: "viejo",
      refreshToken: "viejo-refresh",
      accessTokenExpiresAt: now + 10_000,
    };

    const result = await applyRefreshIfNeeded(token, now);

    expect(result.accessToken).toBe(newAccessToken);
    expect(result.refreshToken).toBe("nuevo-refresh");
    expect(result.error).toBeUndefined();
  });

  it("marca error RefreshError cuando el backend rechaza el refresh token", async () => {
    const now = 1_000_000;
    vi.spyOn(apiClient, "refreshTokens").mockResolvedValue(null);
    const token: RefreshableToken = {
      accessToken: "viejo",
      refreshToken: "revocado",
      accessTokenExpiresAt: now + 10_000,
    };

    const result = await applyRefreshIfNeeded(token, now);

    expect(result.error).toBe("RefreshError");
  });
});
